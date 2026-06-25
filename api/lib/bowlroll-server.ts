import { unzipSync } from 'fflate';
import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from 'undici';
import {
  extractBowlRollFileId,
  parseBowlRollSearchJson,
  type BowlRollSearchResult,
} from '../../shared/bowlroll';

const BOWLROLL_BASE = 'https://bowlroll.net';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PROJECT_EXT = /\.(ustx?|vsqx)$/i;

const bowlrollDispatcher = new Agent({
  connectTimeout: 30000,
  headersTimeout: 60000,
  bodyTimeout: 120000,
});

function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as Error & { cause?: { code?: string }; code?: string };
  const code = err.cause?.code ?? err.code ?? '';
  return (
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'UND_ERR_HEADERS_TIMEOUT' ||
    code === 'UND_ERR_BODY_TIMEOUT' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ENOTFOUND' ||
    err.message === 'fetch failed'
  );
}

type BowlrollResponse = Awaited<ReturnType<typeof undiciFetch>>;

async function bowlrollFetch(
  url: string,
  options: UndiciRequestInit = {},
  retries = 2,
): Promise<BowlrollResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await undiciFetch(url, {
        ...options,
        dispatcher: bowlrollDispatcher,
      });
    } catch (error) {
      lastError = error;
      if (!isNetworkError(error) || attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }

  if (isNetworkError(lastError)) {
    throw new Error('NETWORK_TIMEOUT');
  }
  throw lastError;
}

export async function searchBowlRoll(query: string, page = 1): Promise<BowlRollSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({
    word: trimmed,
    page: String(page),
    sort: 'upload',
    order: 'down',
    date: 'none',
    auth: 'none',
  });

  const referer = `${BOWLROLL_BASE}/file/search?search=${encodeURIComponent(trimmed)}&select=keyword`;
  const response = await bowlrollFetch(`${BOWLROLL_BASE}/api/file/search-by-keyword-files?${params}`, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'application/json',
      Referer: referer,
    },
  });

  if (!response.ok) {
    throw new Error(`BowlRoll search failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  return parseBowlRollSearchJson(data);
}

export async function downloadBowlRollProject(fileUrl: string): Promise<{
  data: Uint8Array;
  fileName: string;
  authorId?: string;
  authorName?: string;
  authorLink?: string;
}> {
  const fileId = extractBowlRollFileId(fileUrl);
  if (!fileId) {
    throw new Error('INVALID_URL');
  }

  const referer = `${BOWLROLL_BASE}/file/${fileId}`;
  const pageResponse = await bowlrollFetch(referer, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html',
    },
  });

  if (!pageResponse.ok) {
    throw new Error('DOWNLOAD_FAILED');
  }

  const cookies = getCookieHeader(pageResponse);
  const pageHtml = await pageResponse.text();
  const pageAuthor = parseAuthorFromFilePage(pageHtml);
  const init = parseFilePageInit(pageHtml);
  if (!init) {
    throw new Error('DOWNLOAD_FAILED');
  }

  if (init.download_control === 'login') {
    throw new Error('LOGIN_REQUIRED');
  }
  if (init.download_control === 'expired') {
    throw new Error('EXPIRED');
  }
  if (init.download_key) {
    throw new Error('PASSWORD_REQUIRED');
  }

  let archiveFiles: string[] = [];
  try {
    const intoResponse = await bowlrollFetch(`${BOWLROLL_BASE}/api/file/${fileId}/into-files`, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'application/json',
        Referer: referer,
        Cookie: cookies,
      },
    });
    if (intoResponse.ok) {
      archiveFiles = parseIntoFilesResponse(await intoResponse.json());
    }
  } catch {
    // Optional metadata.
  }

  const checkBody = new URLSearchParams({
    download_key: 'bowlroll_download_control_mischievous',
    csrf_token: init.csrf_token,
  });

  const checkResponse = await bowlrollFetch(`${BOWLROLL_BASE}/api/file/${fileId}/download-check`, {
    method: 'POST',
    headers: {
      'User-Agent': BROWSER_UA,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: 'application/json',
      Referer: referer,
      Origin: BOWLROLL_BASE,
      Cookie: cookies,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: checkBody.toString(),
  });

  if (!checkResponse.ok) {
    throw new Error('DOWNLOAD_FAILED');
  }

  const checkData = (await checkResponse.json()) as { status?: string; url?: string };
  if (checkData.status !== 'success' || !checkData.url) {
    throw new Error('DOWNLOAD_FAILED');
  }

  const downloadResponse = await bowlrollFetch(checkData.url, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: '*/*',
      Referer: referer,
      Cookie: cookies,
    },
    redirect: 'follow',
  });

  if (!downloadResponse.ok) {
    throw new Error('DOWNLOAD_FAILED');
  }

  const archiveData = new Uint8Array(await downloadResponse.arrayBuffer());
  const archiveName = decodeURIComponent(checkData.url.split('/download-execution/')[1]?.split('?')[0] || '');
  if (archiveName && archiveFiles.length === 0) {
    archiveFiles = [archiveName];
  }

  const project = extractProjectFile(archiveData, archiveFiles);
  return {
    ...project,
    authorId: pageAuthor.authorId,
    authorName: pageAuthor.authorName,
    authorLink: pageAuthor.authorId ? `${BOWLROLL_BASE}/user/${pageAuthor.authorId}` : undefined,
  };
}

function getCookieHeader(response: BowlrollResponse): string {
  return (response.headers.getSetCookie?.() ?? [])
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

function parseAuthorFromFilePage(html: string): { authorId?: string; authorName?: string } {
  const userBlock = html.match(/href="\/user\/(\d+)"[^>]*>([\s\S]*?)<\/a>/i);
  if (!userBlock) {
    const idOnly = html.match(/href="\/user\/(\d+)"/i);
    return idOnly ? { authorId: idOnly[1] } : {};
  }

  const authorName = userBlock[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return {
    authorId: userBlock[1],
    authorName: authorName || undefined,
  };
}

function parseFilePageInit(html: string): { csrf_token: string; download_key: boolean; download_control: string } | null {
  const match = html.match(/id="initialize"([^>]*)>/);
  if (!match) return null;

  const attrs = match[1];
  const read = (name: string) => attrs.match(new RegExp(`data-${name}="([^"]*)"`))?.[1] ?? '';
  const csrf_token = read('csrf_token');
  if (!csrf_token) return null;

  return {
    csrf_token,
    download_key: read('download_key') === 'true',
    download_control: read('download_control') || 'permission',
  };
}

function parseIntoFilesResponse(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  const record = data as Record<string, unknown>;
  const files = record.files ?? record.into_files ?? record.list;
  if (!Array.isArray(files)) return [];

  return files
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object' && 'name' in entry) {
        return String((entry as { name: string }).name);
      }
      return '';
    })
    .filter(Boolean);
}


function extractProjectFile(
  data: Uint8Array,
  knownFiles: string[] = [],
): { data: Uint8Array; fileName: string } {
  const knownProject = knownFiles.find((name) => PROJECT_EXT.test(name));
  if (knownProject && looksLikeUstText(data)) {
    return { data, fileName: knownProject };
  }

  if (looksLikeUstText(data)) {
    return { data, fileName: knownProject || guessProjectFileName(data) || 'download.ust' };
  }

  if (data[0] === 0x50 && data[1] === 0x4b) {
    return extractFromZip(data, knownFiles);
  }

  if (isRarArchive(data) || is7zArchive(data)) {
    throw new Error('UNSUPPORTED_ARCHIVE');
  }

  throw new Error('NO_PROJECT_FILE');
}

function looksLikeUstText(data: Uint8Array): boolean {
  const head = new TextDecoder('utf-8', { fatal: false }).decode(data.slice(0, 800));
  return head.includes('[#SETTING]') || head.includes('[#VERSION]') || /\[#\d+\]/.test(head);
}

function guessProjectFileName(data: Uint8Array): string | null {
  const head = new TextDecoder('utf-8', { fatal: false }).decode(data.slice(0, 200));
  if (head.includes('FormatVersion:') || head.includes('singers:')) return 'download.ustx';
  if (head.includes('<vsq') || head.includes('VSQ')) return 'download.vsqx';
  if (head.includes('[#SETTING]')) return 'download.ust';
  return null;
}

function isRarArchive(data: Uint8Array): boolean {
  return data[0] === 0x52 && data[1] === 0x61 && data[2] === 0x72 && data[3] === 0x21;
}

function is7zArchive(data: Uint8Array): boolean {
  return data[0] === 0x37 && data[1] === 0x7a && data[2] === 0xbc && data[3] === 0xaf;
}

function extractFromZip(data: Uint8Array, knownFiles: string[]): { data: Uint8Array; fileName: string } {
  const entries = unzipSync(data);
  const names = Object.keys(entries);

  const preferredName =
    knownFiles.find((name) => PROJECT_EXT.test(name)) ||
    names.find((name) => PROJECT_EXT.test(name.split('/').pop() || name));

  if (!preferredName) {
    throw new Error('NO_PROJECT_FILE');
  }

  const entryName =
    names.find((name) => name === preferredName) ||
    names.find((name) => (name.split('/').pop() || name) === preferredName.split('/').pop()) ||
    names.find((name) => PROJECT_EXT.test(name));

  if (!entryName) {
    throw new Error('NO_PROJECT_FILE');
  }

  return {
    data: entries[entryName],
    fileName: (entryName.split('/').pop() || entryName).replace(/[\\/:*?"<>|]/g, '_'),
  };
}
