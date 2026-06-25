import { Agent, fetch as undiciFetch } from 'undici';

const agent = new Agent({ connectTimeout: 30000, headersTimeout: 60000, bodyTimeout: 120000 });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const url = 'https://bowlroll.net/file/search?search=' + encodeURIComponent('千本桜 UST') + '&select=keyword';
const res = await undiciFetch(url, { dispatcher: agent, headers: { 'User-Agent': UA } });
const html = await res.text();
for (const needle of ['displayed', 'keyword', 'search', '/file/', 'select']) {
  const idx = html.indexOf(needle + '-files');
  if (idx >= 0) console.log('found', needle + '-files', html.slice(idx, idx + 80));
}
// print module 12 chunk - find t.s=12)}([
const start = html.indexOf('t(t.s=12)}');
const chunk = html.slice(start, start + 3000);
console.log(chunk);
