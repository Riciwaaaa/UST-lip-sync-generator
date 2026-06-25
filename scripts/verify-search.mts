import { searchBowlRoll } from '../api/lib/bowlroll-server.ts';

async function main() {
  for (const q of ['千本桜', 'vocaloid ust']) {
    const results = await searchBowlRoll(q);
    console.log(q, '->', results.length, results.slice(0, 3).map((r) => r.title));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
