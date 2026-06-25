import { readFileSync } from 'node:fs';
const h = readFileSync('scripts/search-keyword.html', 'utf8');
for (const n of ['displayed-files', 'searched', 'keyword', 'search-files', 'card-file']) {
  console.log(n, h.split(n).length - 1);
}
const idx = h.indexOf('displayed-files');
console.log(h.slice(idx - 60, idx + 120));
const idx2 = h.lastIndexOf('t(t.s=');
console.log(h.slice(idx2 - 200, idx2 + 200));
