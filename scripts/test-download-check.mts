import { searchBowlRoll } from '../api/lib/bowlroll-server.ts';
import { Agent, fetch as undiciFetch } from 'undici';

const agent = new Agent({ connectTimeout: 30000, headersTimeout: 60000, bodyTimeout: 120000 });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function getCookies(res: Awaited<ReturnType<typeof undiciFetch>>): string {
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
}

function mergeCookies(...parts: string[]): string {
  const jar = new Map<string, string>();
  for (const part of parts) {
    for (const item of part.split(';').map((s) => s.trim()).filter(Boolean)) {
      const [k, ...v] = item.split('=');
      if (k) jar.set(k, v.join('='));
    }
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function parseInit(html: string) {
  const m = html.match(/id="initialize"([^>]*)>/);
  if (!m) return {};
  const attrs = m[1];
  const get = (name: string) => attrs.match(new RegExp(`data-${name}="([^"]*)"`))?.[1];
  return {
    csrf_token: get('csrf_token'),
    download_key: get('download_key') === 'true',
    download_control: get('download_control'),
  };
}

async function tryDownload(fileId: string) {
  const referer = `https://bowlroll.net/file/${fileId}`;
  const pageRes = await undiciFetch(referer, { dispatcher: agent, headers: { 'User-Agent': UA } });
  const cookies = getCookies(pageRes);
  const html = await pageRes.text();
  const init = parseInit(html);
  console.log('\nfile', fileId, init, 'cookies', cookies.length);

  if (init.download_control === 'login') {
    console.log('needs login');
    return;
  }
  if (init.download_key) {
    console.log('needs password');
    return;
  }

  const body = new URLSearchParams({
    download_key: 'bowlroll_download_control_mischievous',
    csrf_token: init.csrf_token || '',
  });

  const checkRes = await undiciFetch(`https://bowlroll.net/api/file/${fileId}/download-check`, {
    method: 'POST',
    dispatcher: agent,
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: 'application/json',
      Referer: referer,
      Origin: 'https://bowlroll.net',
      Cookie: cookies,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: body.toString(),
  });
  const text = await checkRes.text();
  console.log('check', checkRes.status, text.slice(0, 300));
  if (!text.startsWith('{')) return;
  const data = JSON.parse(text);
  if (data.url) {
    const dl = await undiciFetch(data.url, {
      dispatcher: agent,
      headers: { 'User-Agent': UA, Referer: referer, Cookie: mergeCookies(cookies) },
    });
    const buf = await dl.arrayBuffer();
    console.log('download', dl.status, dl.headers.get('content-type'), buf.byteLength, 'magic', [...new Uint8Array(buf).slice(0, 4)]);
  }
}

const results = await searchBowlRoll('UST');
for (const r of results.slice(0, 8)) {
  await tryDownload(r.fileId);
}
