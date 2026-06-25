import { readFileSync } from 'node:fs';
const h = readFileSync('scripts/search-page.html', 'utf8');
const idx = h.indexOf('header-search');
console.log(h.slice(idx, idx + 800));
