import { prisma } from '@hoard/db';
import type { PsnTrophyTitle } from './platforms/psn';
import { applyAutoCompleteRule } from '../lib/achievements';

/**
 * Title normalization for the title-fallback match (T-D5).
 *
 * The trophy fetcher already runs `cleanPsnTitle()` (strips ®/™ + PS4/PS5
 * suffixes), so the input here is already nominally cleaned. We add
 * lowercasing, punctuation collapse, and whitespace normalize so a
 * `Game.title` like "FAR CRY 6" matches the cleaned trophy title
 * "Far Cry 6". Cheap; no external library.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sumTrophies(t: { bronze: number; silver: number; gold: number; platinum: number }): number {
  return t.bronze + t.silver + t.gold + t.platinum;
}

export interface ApplyPsnTrophyAggregatesResult {
  /** Number of trophy titles that successfully matched a UserGame and got their
   *  aggregates updated. */
  matched: number;
  /** How many of the matched titles flipped to `Completed` via T-D2's rule. */
  autoCompleted: number;
  /** Trophy titles we couldn't match to any UserGame (no PSN id, no title hit).
   *  Counts here are expected on the first sync after T1 — see T-D5. */
  missed: number;
}

/**
 * T2 of the trophies workstream (`docs/TROPHIES_PLAN.md`).
 *
 * For each trophy title returned by `getPsnTrophyTitles`, find the
 * matching `UserGame` and write the aggregate counts. Match strategy
 * (T-D5):
 *
 *   1. **Stable** — match by `Game.psnNpCommunicationId`. Set after the
 *      first successful match for each game; thereafter every PSN sync
 *      hits this path and is immune to title drift.
 *   2. **Fallback** — match by normalized title against the user's
 *      library, but only on Games that don't yet have a
 *      `psnNpCommunicationId`. This avoids overwriting a stable match
 *      with a worse title-based one.
 *
 * For each match:
 *   - Persist `Game.psnNpCommunicationId` if not already set.
 *   - Update `UserGame.achievements{Earned,Total,Percent,UpdatedAt}`.
 *   - Apply the T-D2 auto-complete rule.
 *
 * The whole thing is intentionally read-pull / write-loop rather than a
 * single transaction — no two trophy titles ever touch the same
 * UserGame, and each per-title write is independently idempotent. If
 * the loop dies halfway, the next sync picks up where it left off.
 */
export async function applyPsnTrophyAggregates(
  userId: string,
  trophyTitles: PsnTrophyTitle[],
): Promise<ApplyPsnTrophyAggregatesResult> {
  const userGames = await prisma.userGame.findMany({
    where: { userId },
    include: { game: true },
  });

  // Pre-compute the lookup tables once. The lists are small (≤ a few
  // thousand at the upper bound) so two Maps are cheap and avoid an
  // O(N×M) scan per title.
  const byNpId = new Map<string, (typeof userGames)[number]>();
  const byTitleNoNpId = new Map<string, (typeof userGames)[number]>();
  for (const ug of userGames) {
    if (ug.game.psnNpCommunicationId) {
      byNpId.set(ug.game.psnNpCommunicationId, ug);
    } else {
      // Only games WITHOUT an npCommunicationId go in the title-fallback
      // map. Title is a tiebreaker — last-write-wins on collision is fine,
      // collisions are rare (PSN already de-duplicates titles per account).
      byTitleNoNpId.set(normalize(ug.game.title), ug);
    }
  }

  let matched = 0;
  let autoCompleted = 0;
  let missed = 0;

  for (const trophy of trophyTitles) {
    let userGame = byNpId.get(trophy.npCommunicationId);
    let isFirstMatch = false;

    if (!userGame) {
      const fallback = byTitleNoNpId.get(normalize(trophy.cleanedTitle));
      if (fallback) {
        userGame = fallback;
        isFirstMatch = true; // we're about to persist npCommunicationId for the first time
      }
    }

    if (!userGame) {
      missed++;
      continue;
    }

    const total = sumTrophies(trophy.defined);
    if (total === 0) continue; // shouldn't happen on PSN trophy titles, but defensive
    const earned = sumTrophies(trophy.earned);
    const percent = Math.round((earned / total) * 100);

    if (isFirstMatch) {
      await prisma.game.update({
        where: { id: userGame.game.id },
        data: { psnNpCommunicationId: trophy.npCommunicationId },
      });
    }

    const newStatus = applyAutoCompleteRule(userGame.status, percent);

    await prisma.userGame.update({
      where: { id: userGame.id },
      data: {
        achievementsEarned: earned,
        achievementsTotal: total,
        achievementsPercent: percent,
        achievementsUpdatedAt: trophy.lastUpdatedAt ?? new Date(),
        ...(newStatus ? { status: newStatus } : {}),
      },
    });

    matched++;
    if (newStatus) autoCompleted++;
  }

  return { matched, autoCompleted, missed };
}

// Exported for unit tests.
export const __testing = { normalize, sumTrophies };
