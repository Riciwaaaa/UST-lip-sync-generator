import { Agent, fetch as undiciFetch } from 'undici';

const agent = new Agent({ connectTimeout: 30000, headersTimeout: 60000, bodyTimeout: 120000 });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const search = encodeURIComponent('千本桜 UST');
const base = 'https://bowlroll.net/api/file';

const paths = [
  'searched-files',
  'search-files',
  'keyword-files',
  'displayed-search-files',
  'files',
  'search',
  'card-file',
  'index-files',
];

for (const path of paths) {
  const url = `${base}/${path}?search=${search}&select=keyword&page=1&sort=p&order=d&date=none&auth=none`;
  try {
    const res = await undiciFetch(url, {
      dispatcher: agent,
      headers: { 'User-Agent': UA, Accept: 'application/json', Referer: `https://bowlroll.net/file/search?search=${search}&select=keyword` },
    });
    const text = await res.text();
    const isJson = text.startsWith('{');
    console.log(path, res.status, isJson ? `files:${JSON.parse(text).files?.length}` : text.slice(0, 40));
  } catch (e) {
    console.log(path, 'ERR', (e as Error).message);
  }
}
