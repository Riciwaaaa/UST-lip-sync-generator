import { writeFileSync } from 'node:fs';
import { parseBowlRollSearchHtml } from '../shared/bowlroll.ts';
import { Agent, fetch as undiciFetch } from 'undici';

const agent = new Agent({ connectTimeout: 30000, headersTimeout: 60000, bodyTimeout: 120000 });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const base = 'https://bowlroll.net';
const q = process.argv[2] || '千本桜 UST';

function getCookieHeader(res: Awaited<ReturnType<typeof undiciFetch>>): string {
  const setCookies = res.headers.getSetCookie?.() ?? [];
  return setCookies.map((c) => c.split(';')[0]).join('; ');
}

const warm = await undiciFetch(`${base}/file/search`, {
  dispatcher: agent,
  headers: { 'User-Agent': UA, Accept: 'text/html' },
});
const cookie = getCookieHeader(warm);
console.log('warm', warm.status, 'cookie len', cookie.length);

const formBody = `searchword=${encodeURIComponent(q)}&search=and&search_s=file&sort=p&order=d&page=1&r18=0`;
const post = await undiciFetch(`${base}/file/card-file`, {
  method: 'POST',
  dispatcher: agent,
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    Accept: 'text/html, */*',
    'User-Agent': UA,
    Origin: base,
    Referer: `${base}/file/search`,
    Cookie: cookie,
  },
  body: formBody,
});
console.log('post', post.status, post.headers.get('content-type'));
const html = await post.text();
writeFileSync('scripts/card-file-sample.html', html);
console.log('html len', html.length, '/file/', (html.match(/\/file\/\d+/g) || []).length);
const parsed = parseBowlRollSearchHtml(html);
console.log('parsed', parsed.length, parsed.slice(0, 3));
