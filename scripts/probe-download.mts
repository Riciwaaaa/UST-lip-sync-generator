import { Agent, fetch as undiciFetch } from 'undici';

const agent = new Agent({ connectTimeout: 30000, headersTimeout: 60000, bodyTimeout: 120000 });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const fileId = process.argv[2] || '207208';
const referer = `https://bowlroll.net/file/${fileId}`;

const res = await undiciFetch(referer, { dispatcher: agent, headers: { 'User-Agent': UA } });
const html = await res.text();
console.log('page', res.status, 'len', html.length);

for (const needle of ['download', 'into-files', '/api/file/']) {
  let idx = 0;
  let n = 0;
  while ((idx = html.indexOf(needle, idx)) !== -1 && n < 5) {
    if (needle === 'download' && !html.slice(idx, idx + 30).includes('/api')) {
      idx += needle.length;
      continue;
    }
    console.log('\n---', html.slice(Math.max(0, idx - 40), idx + 120));
    idx += needle.length;
    n++;
  }
}

const tail = html.slice(html.lastIndexOf('t(t.s='));
console.log('\nENTRY', tail.slice(0, 400));

const apis = [...html.matchAll(/\/api\/file\/[a-z0-9-]+/g)].map((m) => m[0]);
console.log('\nAPI paths', [...new Set(apis)]);
