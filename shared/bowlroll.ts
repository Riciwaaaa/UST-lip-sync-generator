export interface BowlRollSearchResult {
  title: string;
  link: string;
  snippet: string;
  source: 'bowlroll';
  fileId: string;
  authorName?: string;
  authorId?: string;
  authorLink?: string;
  uploadedAt?: string;
  downloadCount?: number;
}

const BOWLROLL_BASE = 'https://bowlroll.net';

const PROJECT_TITLE_RE = /\bustx?\b|vsqx?|歌詞|うた/i;

export function extractBowlRollFileId(urlOrId: string): string | null {
  const match = urlOrId.match(/bowlroll\.net\/file\/(\d+)/i) || urlOrId.match(/^(\d+)$/);
  return match ? match[1] : null;
}

export function parseBowlRollSearchHtml(html: string, maxResults = 20): BowlRollSearchResult[] {
  const seen = new Set<string>();
  const results: BowlRollSearchResult[] = [];

  const addResult = (title: string, link: string) => {
    const cleanedTitle = title.replace(/\s+/g, ' ').trim();
    if (!cleanedTitle || cleanedTitle.length < 2) return;

    const fullLink = link.startsWith('http') ? link : `${BOWLROLL_BASE}${link}`;
    const fileId = extractBowlRollFileId(fullLink);
    if (!fileId || seen.has(fileId)) return;
    if (fullLink.includes('/user/') || fullLink.includes('/search')) return;

    seen.add(fileId);
    results.push({
      title: cleanedTitle,
      link: `${BOWLROLL_BASE}/file/${fileId}`,
      snippet: '',
      source: 'bowlroll',
      fileId,
    });
  };

  const cardPatterns = [
    /<div[^>]*class="[^"]*filelist_line[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]*class="[^"]*filelist_line|$)/gi,
    /<div[^>]*class="[^"]*tile[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi,
    /<div[^>]*class="[^"]*column[^"]*"[^>]*>\s*<div[^>]*class="[^"]*card[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi,
  ];

  const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i;

  for (const blockRegex of cardPatterns) {
    let match: RegExpExecArray | null;
    while ((match = blockRegex.exec(html)) !== null) {
      const linkMatch = linkRegex.exec(match[1]);
      if (!linkMatch) continue;
      addResult(linkMatch[2], linkMatch[1]);
    }
    if (results.length > 0) break;
  }

  const fileLinkRegex = /<a[^>]*href="(\/file\/\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let fileMatch: RegExpExecArray | null;
  while ((fileMatch = fileLinkRegex.exec(html)) !== null) {
    addResult(fileMatch[2], fileMatch[1]);
  }

  return sortSearchResults(results).slice(0, maxResults);
}

export function parseBowlRollSearchJson(data: unknown, maxResults = 20): BowlRollSearchResult[] {
  if (!data || typeof data !== 'object') return [];
  const record = data as {
    files?: Array<{
      id: number | string;
      title?: string;
      user_name?: string;
      user_id?: number | string;
      upload_at?: string;
      download_count?: number;
    }>;
  };
  if (!Array.isArray(record.files)) return [];

  const results: BowlRollSearchResult[] = [];
  for (const file of record.files) {
    const fileId = String(file.id ?? '');
    const title = (file.title || '').trim();
    if (!fileId || !title) continue;

    const authorId = file.user_id != null ? String(file.user_id) : undefined;
    const authorName = (file.user_name || '').trim() || undefined;

    results.push({
      title,
      link: `${BOWLROLL_BASE}/file/${fileId}`,
      snippet: '',
      source: 'bowlroll',
      fileId,
      authorName,
      authorId,
      authorLink: authorId ? `${BOWLROLL_BASE}/user/${authorId}` : undefined,
      uploadedAt: (file.upload_at || '').trim() || undefined,
      downloadCount: typeof file.download_count === 'number' ? file.download_count : undefined,
    });
  }

  const projectLike = results.filter((item) => PROJECT_TITLE_RE.test(item.title));
  const ranked = sortSearchResults(projectLike.length > 0 ? projectLike : results);
  return ranked.slice(0, maxResults);
}

export function getAuthorAccountId(result: BowlRollSearchResult): string | null {
  if (result.authorId) return result.authorId;
  const fromLink = result.authorLink?.match(/\/user\/(\d+)/i)?.[1];
  return fromLink || null;
}

export function sortSearchResults(results: BowlRollSearchResult[]): BowlRollSearchResult[] {
  const score = (result: BowlRollSearchResult) => {
    const title = result.title.toLowerCase();
    let value = 0;
    if (/\bustx?\b/.test(title) || title.includes('ust')) value += 10;
    if (title.includes('うた') || title.includes('歌詞')) value += 5;
    if (title.includes('vsq')) value += 3;
    if (title.includes('off vocal') || title.includes('_off')) value -= 2;
    return value;
  };
  return [...results].sort((a, b) => score(b) - score(a));
}
