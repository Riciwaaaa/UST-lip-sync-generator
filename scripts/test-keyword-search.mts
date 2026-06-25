import { writeFileSync } from 'node:fs';
import { Agent, fetch as undiciFetch } from 'undici';
import { parseBowlRollSearchHtml } from '../shared/bowlroll.ts';

const agent = new Agent({ connectTimeout: 30000, headersTimeout: 60000, bodyTimeout: 120000 });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const urls = [
  'https://bowlroll.net/file/search?search=' + encodeURIComponent('千本桜 UST') + '&select=keyword',
  'https://bowlroll.net/file/search?search=' + encodeURIComponent('千本桜') + '&select=keyword&page=1',
];

for (const url of urls) {
  const res = await undiciFetch(url, { dispatcher: agent, headers: { 'User-Agent': UA } });
  const html = await res.text();
  console.log('\nURL', url);
  console.log('title', html.match(/<title>([^<]+)/)?.[1]);
  console.log('/file/ ids', (html.match(/\/file\/\d+/g) || []).length);
  console.log('parsed', parseBowlRollSearchHtml(html).length);
  if (url.includes('千本桜 UST')) writeFileSync('scripts/search-keyword.html', html);
}

// Try API with search param
const apiUrl =
  'https://bowlroll.net/api/file/displayed-files?' +
  new URLSearchParams({
    sort: 'upload',
    order: 'down',
    page: '1',
    date: 'none',
    auth: 'none',
    search: '千本桜 UST',
    select: 'keyword',
  });
const apiRes = await undiciFetch(apiUrl, {
  dispatcher: agent,
  headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://bowlroll.net/file/search' },
});
const apiText = await apiRes.text();
console.log('\nAPI', apiRes.status, apiText.slice(0, 500));
