import { readFileSync } from 'node:fs';
const h = readFileSync('scripts/search-sample.html', 'utf8');
const matches = h.match(/\/api[^"'\\s]{3,80}/g) || [];
console.log([...new Set(matches)].join('\n'));
const searchRefs = h.match(/search[^"'\\]{0,60}/gi) || [];
console.log('\n--- search refs ---');
console.log([...new Set(searchRefs)].filter((s) => s.includes('api') || s.includes('file')).slice(0, 40).join('\n'));
