import { readFileSync } from 'node:fs';
const h = readFileSync('scripts/search-sample.html', 'utf8');
for (const needle of ['card-file', 'displayed-files', 'searchword', 'file/search', '/api/file/']) {
  let idx = 0;
  let count = 0;
  while ((idx = h.indexOf(needle, idx)) !== -1 && count < 3) {
    console.log('\n---', needle, '---');
    console.log(h.slice(Math.max(0, idx - 80), idx + needle.length + 120));
    idx += needle.length;
    count++;
  }
}
