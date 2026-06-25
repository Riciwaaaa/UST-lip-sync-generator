import { writeFileSync } from 'node:fs';
import { Agent, fetch as undiciFetch } from 'undici';

const agent = new Agent({ connectTimeout: 30000, headersTimeout: 60000, bodyTimeout: 120000 });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const params = new URLSearchParams({
  searchword: '千本桜 UST',
  search: 'and',
  search_s: 'file',
  sort: 'p',
  order: 'd',
  page: '1',
  r18: '0',
});
const url = `https://bowlroll.net/file/search?${params}`;
const res = await undiciFetch(url, { dispatcher: agent, headers: { 'User-Agent': UA } });
const html = await res.text();
writeFileSync('scripts/search-page.html', html);
console.log('status', res.status, 'len', html.length);
console.log('title', html.match(/<title>([^<]+)/)?.[1]);
console.log('initialize', html.match(/id=\"initialize\"[^>]*>/)?.[0] || html.match(/initialize/)?.[0]);
for (const needle of ['displayed-files', 'card-file', 'search-files', 'searched-files']) {
  console.log(needle, html.includes(needle));
}
