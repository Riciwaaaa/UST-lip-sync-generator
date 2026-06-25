import { Agent, fetch as undiciFetch } from 'undici';

const agent = new Agent({ connectTimeout: 30000, headersTimeout: 60000, bodyTimeout: 120000 });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const url = 'https://bowlroll.net/file/search?search=' + encodeURIComponent('千本桜 UST') + '&select=keyword';
const res = await undiciFetch(url, { dispatcher: agent, headers: { 'User-Agent': UA } });
const html = await res.text();
const init = html.match(/id="initialize"[^>]*>/);
console.log(init?.[0]);
const idx = html.indexOf('keyword-files');
console.log(html.slice(idx - 150, idx + 200));
