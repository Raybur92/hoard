/**
 * Daily refresh cron entry point — deals + events.
 *
 * Designed to run as a separate Railway cron-scheduled service in the
 * same project as the API. Imports the orchestrators directly (no HTTP)
 * so it bypasses admin-session auth and runs in the same network/region
 * as the DB.
 *
 * Wire-up on Railway (one-time, in the dashboard):
 *   1. New service in the Hoard project → "deals-refresh-cron"
 *   2. Source: same GitHub repo, branch main
 *   3. Build command: `npm run build --workspace=apps/api`
 *   4. Start command: `node apps/api/dist/cron/deals-refresh.js`
 *   5. Cron schedule: `0 4 * * *` (04:00 UTC daily)
 *   6. Env vars: copy from the API service (DATABASE_URL, ITAD_API_KEY,
 *      TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, STEAM_API_KEY, plus any
 *      reseller-affiliate vars you have set). NODE_ENV=production.
 *
 * Run order:
 *   1. Events sync (IGDB showcase events — fast, ~5s)
 *   2. ITAD deals
 *   3. Bundles
 *   4. Nintendo deals
 *   5. PSN deals
 *
 * The full deals chain takes ~70 min for Andrea's library size. Railway
 * cron services don't have execution timeouts (within reason).
 *
 * Failure mode: per-source failures are caught inside each orchestrator
 * and logged; the run continues. Top-level errors cause exit code 1 so
 * Railway flags the run as failed and surfaces it in the dashboard.
 */
import 'dotenv/config';
import { prisma } from '@hoard/db';
import { syncAllDeals } from '../services/deals/syncDeals';
import { syncAllBundles } from '../services/deals/syncBundles';
import { syncAllNintendoDeals } from '../services/deals/syncNintendoDeals';
import { syncAllPsnDeals } from '../services/deals/syncPsnDeals';
import { syncAllEvents } from '../services/events';

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log(`[cron/daily] starting at ${new Date().toISOString()}`);

  try {
    console.log('[cron/daily] step 1/5: syncAllEvents (IGDB)...');
    const events = await syncAllEvents(prisma);
    console.log('[cron/daily] step 1/5 done:', events);

    console.log('[cron/daily] step 2/5: syncAllDeals (ITAD)...');
    const deals = await syncAllDeals();
    console.log('[cron/daily] step 2/5 done:', deals);

    console.log('[cron/daily] step 3/5: syncAllBundles...');
    const bundles = await syncAllBundles();
    console.log('[cron/daily] step 3/5 done:', bundles);

    console.log('[cron/daily] step 4/5: syncAllNintendoDeals...');
    const nintendo = await syncAllNintendoDeals();
    console.log('[cron/daily] step 4/5 done:', nintendo);

    console.log('[cron/daily] step 5/5: syncAllPsnDeals...');
    const psn = await syncAllPsnDeals();
    console.log('[cron/daily] step 5/5 done:', psn);

    // Purge globally-expired deal rows that individual orchestrators may have
    // missed (each orchestrator only cleans up shops it re-fetched).
    const purged = await prisma.deal.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    if (purged.count > 0) console.log(`[cron/daily] purged ${purged.count} expired deal rows`);

    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    console.log(
      `[cron/daily] complete in ${elapsedSec}s — ` +
      `events=${events.eventsUpserted} ` +
      `deals=${deals.dealsUpserted} ` +
      `bundles=${bundles.upserted} ` +
      `nintendo=${nintendo.upserted} ` +
      `psn=${psn.upserted}`,
    );
    process.exit(0);
  } catch (err) {
    console.error('[cron/daily] FAILED:', err instanceof Error ? err.stack ?? err.message : err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
