import { readFileSync, writeFileSync } from 'node:fs';
import { Agent, fetch as undiciFetch } from 'undici';

const agent = new Agent({ connectTimeout: 30000, headersTimeout: 60000, bodyTimeout: 120000 });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const fileId = process.argv[2] || '207208';
const referer = `https://bowlroll.net/file/${fileId}`;

const res = await undiciFetch(referer, { dispatcher: agent, headers: { 'User-Agent': UA } });
const html = await res.text();
writeFileSync('scripts/file-page-snippet.txt', html);

const patterns = ['download-file', 'download_url', 'download-url', '/download', 'get-file', 'storage-file'];
for (const p of patterns) {
  const count = html.split(p).length - 1;
  if (count) console.log(p, count);
}

let idx = 0;
while ((idx = html.indexOf('download', idx)) !== -1) {
  const snippet = html.slice(idx - 30, idx + 80);
  if (snippet.includes('/api') || snippet.includes('href') || snippet.includes('url')) {
    console.log(snippet.replace(/\s+/g, ' '));
  }
  idx += 8;
  if (idx > 500000) break;
}
