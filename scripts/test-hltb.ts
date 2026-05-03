import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });
import { fetchHltbBySteamId } from '../apps/api/src/services/hltb';

async function main() {
  const tests: Array<{ name: string; steamAppId: number }> = [
    { name: 'Elden Ring', steamAppId: 1245620 },
    { name: 'Dota 2', steamAppId: 570 },
    { name: 'The Witcher 3', steamAppId: 292030 },
  ];

  for (const { name, steamAppId } of tests) {
    const result = await fetchHltbBySteamId(steamAppId);
    if (result) {
      console.log(`${name}: main=${result.mainStory ? Math.round(result.mainStory / 60) + 'h' : '—'} extras=${result.mainExtras ? Math.round(result.mainExtras / 60) + 'h' : '—'} 100%=${result.completionist ? Math.round(result.completionist / 60) + 'h' : '—'}`);
    } else {
      console.log(`${name}: not found`);
    }
  }
}

main().catch(console.error);
