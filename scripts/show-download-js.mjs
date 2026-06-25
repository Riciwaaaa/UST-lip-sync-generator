import { readFileSync } from 'node:fs';
const html = readFileSync('scripts/file-page-snippet.txt', 'utf8');
const target = 'location.href=e.url';
const idx = html.indexOf(target);
console.log(html.slice(idx - 600, idx + 200).replace(/\s+/g, ' '));
