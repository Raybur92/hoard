import 'dotenv/config';
import { getPsnPrice } from '../apps/api/src/services/psnPrices';
(async () => {
  console.log('Testing getPsnPrice("Warlock", "en-at") with current code...');
  const p = await getPsnPrice('Warlock', 'en-at');
  if (p === null) {
    console.log('✓ Picker returns null — Warlock would be cleared on next sync');
  } else {
    console.log('✗ Picker returned a match (BAD — picker still has a bug):');
    console.log(`  title="${p.title}" url=${p.url} price=${p.current} discount=${p.discountPct}%`);
  }
})();
