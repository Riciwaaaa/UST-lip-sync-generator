import { writeFileSync } from 'node:fs';
import { searchBowlRoll } from '../api/lib/bowlroll-server.ts';
import { parseBowlRollSearchHtml } from '../shared/bowlroll.ts';
import { Agent, fetch as undiciFetch } from 'undici';

const agent = new Agent({ connectTimeout: 30000, headersTimeout: 60000, bodyTimeout: 120000 });
const q = process.argv[2] || '千本桜';
const params = new URLSearchParams({
  searchword: `${q} UST`,
  search: 'and',
  search_s: 'file',
  sort: 'p',
  order: 'd',
  page: '1',
  r18: '0',
});

const url = `https://bowlroll.net/file/search?${params}`;
const res = await undiciFetch(url, {
  dispatcher: agent,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: 'text/html',
    Referer: 'https://bowlroll.net/file/search',
  },
});
console.log('HTTP', res.status);
const html = await res.text();
writeFileSync('scripts/search-sample.html', html);
console.log('html length', html.length);
console.log('/file/ count', (html.match(/\/file\/\d+/g) || []).length);
const parsed = parseBowlRollSearchHtml(html);
console.log('parsed', parsed.length, parsed.slice(0, 3));

try {
  const results = await searchBowlRoll(q);
  console.log('searchBowlRoll', results.length);
} catch (e) {
  console.error('searchBowlRoll error', e);
}
