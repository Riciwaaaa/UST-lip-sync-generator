import { Agent, fetch as undiciFetch } from 'undici';

const agent = new Agent({ connectTimeout: 30000, headersTimeout: 60000, bodyTimeout: 120000 });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const word = encodeURIComponent('千本桜 UST');

const urls = [
  `https://bowlroll.net/api/file/displayed-files?sort=p&order=d&page=1&date=none&auth=none&word=${word}`,
  `https://bowlroll.net/api/file/displayed-files?sort=upload&order=down&page=1&word=${word}`,
  `https://bowlroll.net/api/file/search?searchword=${word}&search=and&search_s=file&sort=p&order=d&page=1&r18=0`,
  `https://bowlroll.net/api/file/search-files?searchword=${word}&page=1`,
  `https://bowlroll.net/api/file/card-file?searchword=${word}&search=and&search_s=file&sort=p&order=d&page=1&r18=0`,
];

for (const url of urls) {
  try {
    const res = await undiciFetch(url, {
      dispatcher: agent,
      headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://bowlroll.net/file/search' },
    });
    const text = await res.text();
    console.log('\n', res.status, url.split('?')[0]);
    console.log(text.slice(0, 400));
  } catch (e) {
    console.log('fail', url, e.message);
  }
}
