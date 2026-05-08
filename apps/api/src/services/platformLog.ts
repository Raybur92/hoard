import { prisma } from '@hoard/db';
import type { LogLevel } from '@hoard/db';

/**
 * Append a single entry to the platform activity log (PR B of
 * `docs/SETTINGS_AUDIT_PLAN.md`). Called from the sync route handler
 * at every meaningful touchpoint: sync.started, library.imported,
 * trophies.applied, achievements.applied, wishlist.imported, sync.ok,
 * sync.error, etc.
 *
 * Failures here must NEVER fail the calling sync flow — logging is a
 * tracing aid, not a correctness primitive. Errors are swallowed and
 * surfaced via console for ops debugging only.
 *
 * Aggregate writes only — per-game / per-trophy lines are deliberately
 * out of scope for v1 (would explode entry count).
 */
export async function logPlatform(
  platformId: string,
  userId: string,
  level: LogLevel,
  event: string,
  message: string,
  // `object` is the loosest "structured value" type that Prisma's JSON
  // input accepts; the orchestrator result types (e.g.
  // `ApplyPsnTrophyAggregatesResult`) satisfy it directly without
  // forcing an index signature on the public result shapes.
  details?: object,
): Promise<void> {
  try {
    await prisma.platformLog.create({
      data: {
        platformId,
        userId,
        level,
        event,
        message,
        // Omit when undefined so Prisma falls back to the column default
        // (NULL) rather than us having to wire Prisma.JsonNull.
        ...(details ? { details: details as object } : {}),
      },
    });
  } catch (err) {
    // Don't propagate — log to console for ops, let the caller continue.
    console.error(`[platformLog] ${event} write failed:`, err instanceof Error ? err.message : err);
  }
}
