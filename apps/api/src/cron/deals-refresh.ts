/**
 * Daily deals-refresh cron entry point.
 *
 * Designed to run as a separate Railway cron-scheduled service in the
 * same project as the API. Imports the orchestrators directly (no HTTP)
 * so it bypasses the admin-session auth on /api/admin/deals/refresh and
 * runs in the same network/region as the DB.
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
 * The full chain (ITAD → bundles → Nintendo → PSN) takes ~70 min for
 * Andrea's library size. Railway cron services don't have execution
 * timeouts (within reason); the run completes whenever it completes.
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

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log(`[cron/deals-refresh] starting at ${new Date().toISOString()}`);
  try {
    console.log('[cron/deals-refresh] step 1/4: syncAllDeals (ITAD)...');
    const deals = await syncAllDeals();
    console.log('[cron/deals-refresh] step 1/4 done:', deals);

    console.log('[cron/deals-refresh] step 2/4: syncAllBundles...');
    const bundles = await syncAllBundles();
    console.log('[cron/deals-refresh] step 2/4 done:', bundles);

    console.log('[cron/deals-refresh] step 3/4: syncAllNintendoDeals...');
    const nintendo = await syncAllNintendoDeals();
    console.log('[cron/deals-refresh] step 3/4 done:', nintendo);

    console.log('[cron/deals-refresh] step 4/4: syncAllPsnDeals...');
    const psn = await syncAllPsnDeals();
    console.log('[cron/deals-refresh] step 4/4 done:', psn);

    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    console.log(`[cron/deals-refresh] complete in ${elapsedSec}s — deals=${deals.dealsUpserted} bundles=${bundles.upserted} nintendo=${nintendo.upserted} psn=${psn.upserted}`);
    process.exit(0);
  } catch (err) {
    console.error('[cron/deals-refresh] FAILED:', err instanceof Error ? err.stack ?? err.message : err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
