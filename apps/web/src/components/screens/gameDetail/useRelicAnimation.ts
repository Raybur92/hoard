/**
 * GD-PR4b — first-reveal animation gate for the OQ-GD-13 relic surface.
 *
 * Returns whether the 5-stage consecration animation should fire on
 * this render. Reads/writes a localStorage flag per (user, game) pair
 * — first visit returns `true` and marks the relic as "consecrated";
 * subsequent visits return `false` (card renders in final state, no
 * choreography).
 *
 * The animation itself is CSS-driven (see styles/relic.css); this hook
 * only governs whether the `.relic-animate` class lands on the parent.
 * Sets the localStorage flag at sequence-end (~2400ms) so a refresh
 * mid-animation doesn't re-trigger the sequence.
 *
 * Edge cases:
 *  - localStorage unavailable (private browsing in some browsers) →
 *    every visit gets the animation (acceptable degradation; the
 *    sequence is short).
 *  - prefers-reduced-motion is handled in CSS, not here. The hook
 *    still returns true on first visit but the user sees the 200ms
 *    cross-fade collapse.
 *
 * Storage key: `hoard:relic-consecrated:${userGameId}` boolean.
 */

import { useEffect, useState } from 'react';

const STORAGE_PREFIX = 'hoard:relic-consecrated:';
const SEQUENCE_TOTAL_MS = 2400;

export function useRelicAnimation(userGameId: string | null): boolean {
  // Defaults to false so the first render shows final state. We flip to
  // true in useEffect after reading localStorage, then schedule the
  // localStorage write at sequence end. Both reads/writes are in
  // try/catch to survive private-browsing storage failures.
  const [shouldAnimate, setShouldAnimate] = useState(false);

  useEffect(() => {
    if (!userGameId) return;
    const key = STORAGE_PREFIX + userGameId;
    let alreadyConsecrated = false;
    try {
      alreadyConsecrated = localStorage.getItem(key) === '1';
    } catch {
      // localStorage unavailable — fall through and animate.
    }
    if (alreadyConsecrated) return;

    // First visit. Toggle on, schedule the localStorage write at sequence end.
    setShouldAnimate(true);
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(key, '1'); }
      catch { /* private browsing — accept that we'll animate next time too */ }
    }, SEQUENCE_TOTAL_MS);

    return () => window.clearTimeout(timer);
  }, [userGameId]);

  return shouldAnimate;
}
