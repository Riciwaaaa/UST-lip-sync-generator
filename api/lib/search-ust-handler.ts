import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  downloadBowlRollProject,
  searchBowlRoll,
} from './bowlroll-server.js';
import type { BowlRollSearchResult } from '../../shared/bowlroll';

function toBase64(data: Uint8Array): string {
  return Buffer.from(data).toString('base64');
}

function mapFetchError(error: unknown): { status: number; code: string } {
  const message = error instanceof Error ? error.message : String(error);
  switch (message) {
    case 'NETWORK_TIMEOUT':
      return { status: 502, code: 'NETWORK_TIMEOUT' };
    case 'PASSWORD_REQUIRED':
      return { status: 403, code: 'PASSWORD_REQUIRED' };
    case 'LOGIN_REQUIRED':
      return { status: 403, code: 'LOGIN_REQUIRED' };
    case 'EXPIRED':
      return { status: 410, code: 'EXPIRED' };
    case 'UNSUPPORTED_ARCHIVE':
      return { status: 415, code: 'UNSUPPORTED_ARCHIVE' };
    case 'NO_PROJECT_FILE':
      return { status: 422, code: 'NO_PROJECT_FILE' };
    case 'INVALID_URL':
      return { status: 400, code: 'INVALID_URL' };
    default:
      return { status: 502, code: 'DOWNLOAD_FAILED' };
  }
}

export async function handleSearchUst(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const action = req.query.action as string | undefined;
  const query = (req.query.q as string | undefined)?.trim();
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const url = req.query.url as string | undefined;

  if (action === 'search' && query) {
    try {
      const results: BowlRollSearchResult[] = await searchBowlRoll(query, page);
      console.log(`[search-ust] q="${query}" page=${page} -> ${results.length} results`);
      res.status(200).json({ results, source: 'bowlroll', page });
    } catch (error) {
      console.error('Search error:', error);
      const mapped = mapFetchError(error);
      res.status(mapped.status).json({ error: mapped.code });
    }
    return;
  }

  if (action === 'fetch' && url) {
    try {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        res.status(400).json({ error: 'INVALID_URL' });
        return;
      }

      const { data, fileName, authorId, authorName, authorLink } = await downloadBowlRollProject(url);
      res.status(200).json({
        content: toBase64(data),
        fileName,
        size: data.byteLength,
        authorId,
        authorName,
        authorLink,
      });
    } catch (error) {
      console.error('Fetch error:', error);
      const mapped = mapFetchError(error);
      console.log(`[search-ust] fetch ${url} -> ${mapped.code}`);
      res.status(mapped.status).json({ error: mapped.code });
    }
    return;
  }

  res.status(400).json({ error: 'INVALID_ACTION' });
}
