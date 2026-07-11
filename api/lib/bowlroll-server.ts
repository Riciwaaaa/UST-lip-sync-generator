import Encoding from 'encoding-japanese';
import { unzipSync } from 'fflate';
import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from 'undici';
import {
  extractBowlRollFileId,
  parseBowlRollSearchJson,
  type BowlRollSearchResult,
} from '../../shared/bowlroll.js';

const BOWLROLL_BASE = 'https://bowlroll.net';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PROJECT_EXT = /\.(ustx?|vsqx)$/i;
// Vercel 响应体上限约 4.5MB，候选文件内容合计超过此值时不内联，改由客户端带 entry 参数二次请求
const MAX_INLINE_CANDIDATES_BYTES = 3 * 1024 * 1024;
const README_MAX_CHARS = 10000;

export interface ProjectCandidate {
  entryName: string;
  fileName: string;
  size: number;
  data?: Uint8Array;
}

export interface ArchiveReadme {
  fileName: string;
  content: string;
}

const bowlrollDispatcher = new Agent({
  connectTimeout: 8000,
  headersTimeout: 15000,
  bodyTimeout: 20000,
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

export async function downloadBowlRollProject(fileUrl: string, entryName?: string): Promise<{
  data: Uint8Array;
  fileName: string;
  authorId?: string;
  authorName?: string;
  authorLink?: string;
  description?: string;
  readme?: ArchiveReadme;
  candidates?: ProjectCandidate[];
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

  const project = extractProjectFile(archiveData, archiveFiles, entryName);
  return {
    ...project,
    authorId: pageAuthor.authorId,
    authorName: pageAuthor.authorName,
    authorLink:
      pageAuthor.authorId && pageAuthor.authorId !== '0'
        ? `${BOWLROLL_BASE}/user/${pageAuthor.authorId}`
        : undefined,
    description: parseDescriptionFromFilePage(pageHtml),
  };
}

function getCookieHeader(response: BowlrollResponse): string {
  return (response.headers.getSetCookie?.() ?? [])
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

function parseAuthorFromFilePage(html: string): { authorId?: string; authorName?: string } {
  // #initialize 元素直接带 data-user_id / data-user_name，比扫作者主页链接可靠
  const init = html.match(/id="initialize"([^>]*)>/);
  if (init) {
    const read = (name: string) => init[1].match(new RegExp(`data-${name}="([^"]*)"`))?.[1] ?? '';
    const authorId = read('user_id');
    const authorName = unescapeHtmlEntities(read('user_name')).trim();
    if (authorId) {
      return { authorId, authorName: authorName || undefined };
    }
  }

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

// 文件简介只在服务端渲染的 meta description 里（正文由 JS 渲染，无公开详情 API）
function parseDescriptionFromFilePage(html: string): string | undefined {
  const match =
    html.match(/<meta\s+name="description"\s+content="([^"]*)"/i) ||
    html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/i);
  if (!match) return undefined;
  const text = unescapeHtmlEntities(match[1]).trim();
  return text || undefined;
}

function unescapeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
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


export function extractProjectFile(
  data: Uint8Array,
  knownFiles: string[] = [],
  entryName?: string,
): { data: Uint8Array; fileName: string; readme?: ArchiveReadme; candidates?: ProjectCandidate[] } {
  // zip 魔数必须先判：无压缩（stored）的 zip 头部能直接看到 UST 文本，会被 looksLikeUstText 误判
  if (data[0] === 0x50 && data[1] === 0x4b) {
    return extractFromZip(data, knownFiles, entryName);
  }

  const knownProject = knownFiles.find((name) => PROJECT_EXT.test(name));
  if (looksLikeUstText(data)) {
    return { data, fileName: knownProject || guessProjectFileName(data) || 'download.ust' };
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

function extractFromZip(
  data: Uint8Array,
  knownFiles: string[],
  entryName?: string,
): { data: Uint8Array; fileName: string; readme?: ArchiveReadme; candidates?: ProjectCandidate[] } {
  const entries = unzipSync(data);
  const names = Object.keys(entries).filter((name) => !name.endsWith('/'));

  const projectNames = names.filter((name) => PROJECT_EXT.test(name.split('/').pop() || name));
  if (projectNames.length === 0) {
    throw new Error('NO_PROJECT_FILE');
  }

  // 二次请求：客户端在多候选弹窗里选定了具体条目
  if (entryName) {
    const target = projectNames.find((name) => name === entryName);
    if (!target) {
      throw new Error('NO_PROJECT_FILE');
    }
    return { data: entries[target], fileName: entryDisplayName(target) };
  }

  const knownProject = knownFiles.find((name) => PROJECT_EXT.test(name));
  const primary =
    (knownProject &&
      (projectNames.find((name) => name === knownProject) ||
        projectNames.find((name) => (name.split('/').pop() || name) === knownProject.split('/').pop()))) ||
    projectNames[0];

  const result: { data: Uint8Array; fileName: string; readme?: ArchiveReadme; candidates?: ProjectCandidate[] } = {
    data: entries[primary],
    fileName: entryDisplayName(primary),
    readme: extractReadme(entries, names, projectNames),
  };

  if (projectNames.length > 1) {
    const totalSize = projectNames.reduce((sum, name) => sum + entries[name].length, 0);
    const inline = totalSize <= MAX_INLINE_CANDIDATES_BYTES;
    result.candidates = projectNames.map((name) => ({
      entryName: name,
      fileName: entryDisplayName(name),
      size: entries[name].length,
      data: inline ? entries[name] : undefined,
    }));
  }

  return result;
}

function entryDisplayName(entryName: string): string {
  const base = entryName.split('/').pop() || entryName;
  return decodeZipEntryName(base).replace(/[\\/:*?"<>|]/g, '_');
}

// fflate 对无 UTF-8 标志的 zip 条目名按 Latin-1 解码（字节保真），日文 zip 常为 Shift-JIS，
// 需还原字节后重新检测解码；含 >0xFF 字符说明本来就是正确解码的 UTF-8 名，原样返回
function decodeZipEntryName(name: string): string {
  if (!name || /^[\x20-\x7e]*$/.test(name)) return name;
  const bytes = new Uint8Array(name.length);
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (code > 0xff) return name;
    bytes[i] = code;
  }
  const decoded = decodeJapaneseText(bytes).trim();
  return decoded || name;
}

function decodeJapaneseText(bytes: Uint8Array): string {
  try {
    const detected = Encoding.detect(bytes);
    const detectedStr = detected ? detected.toString().toUpperCase() : '';
    if (!detected || detectedStr.includes('UTF8') || detectedStr === 'ASCII' || detectedStr.includes('UNICODE')) {
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^\uFEFF/, '');
    }
    return (
      Encoding.convert(bytes, { to: 'UNICODE', from: detected, type: 'string' }) as unknown as string
    ).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^\uFEFF/, '');
  }
}

function extractReadme(
  entries: Record<string, Uint8Array>,
  names: string[],
  projectNames: string[],
): ArchiveReadme | undefined {
  const candidates = names.filter((name) => !projectNames.includes(name));
  const baseOf = (name: string) => decodeZipEntryName(name.split('/').pop() || name);

  let target = candidates.find((name) => {
    const base = baseOf(name);
    return /readme|お読み|よみください|読んで|はじめに/i.test(base) && /\.(txt|md)$/i.test(base);
  });
  if (!target) {
    // 没有明确的 README 时，压缩包里唯一的 txt 也视作说明文件
    const txts = candidates.filter((name) => /\.txt$/i.test(baseOf(name)));
    if (txts.length === 1) target = txts[0];
  }
  if (!target) return undefined;

  const content = decodeJapaneseText(entries[target]).slice(0, README_MAX_CHARS).trim();
  if (!content) return undefined;
  return { fileName: baseOf(target), content };
}
