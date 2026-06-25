import { Agent, fetch as undiciFetch } from 'undici';

const agent = new Agent({ connectTimeout: 30000, headersTimeout: 60000, bodyTimeout: 120000 });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

for (const word of ['千本桜', '千本桜 UST', 'UST', 'vocaloid']) {
  const params = new URLSearchParams({ word, page: '1', sort: 'upload', order: 'down', date: 'none', auth: 'none' });
  const url = `https://bowlroll.net/api/file/search-by-keyword-files?${params}`;
  const res = await undiciFetch(url, {
    dispatcher: agent,
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
      Referer: `https://bowlroll.net/file/search?search=${encodeURIComponent(word)}&select=keyword`,
    },
  });
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    console.log(word, '->', data.files?.length, data.files?.slice(0, 2).map((f: { title: string }) => f.title));
  } catch {
    console.log(word, '->', res.status, text.slice(0, 80));
  }
}
