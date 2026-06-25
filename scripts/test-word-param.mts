import { Agent, fetch as undiciFetch } from 'undici';

const agent = new Agent({ connectTimeout: 30000, headersTimeout: 60000, bodyTimeout: 120000 });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

async function trySearch(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const url = `https://bowlroll.net/api/file/displayed-files?${qs}`;
  const res = await undiciFetch(url, {
    dispatcher: agent,
    headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://bowlroll.net/file/search' },
  });
  const data = JSON.parse(await res.text());
  const titles = (data.files || []).map((f: { title: string }) => f.title);
  console.log(params, '->', titles.length, 'files', titles.slice(0, 5));
}

await trySearch({ sort: 'p', order: 'd', page: '1', date: 'none', auth: 'none', word: '千本桜 UST' });
await trySearch({ sort: 'upload', order: 'down', page: '1', word: '千本桜' });
await trySearch({ sort: 'upload', order: 'down', page: '1', word: '千本桜 UST' });
await trySearch({ sort: 'p', order: 'd', page: '1', searchword: '千本桜 UST', search: 'and', search_s: 'file', r18: '0' });
