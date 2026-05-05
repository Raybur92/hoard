import { useEffect, useRef, useState } from 'react';

const PULL_THRESHOLD = 64;     // px before refresh fires
const PULL_DAMPING = 2.2;      // higher = more resistance, less visual pull
const MAX_VISIBLE_PULL = 80;   // visual cap on pull distance

export interface PullState {
  /** Current visual pull distance in px (capped at MAX_VISIBLE_PULL). 0 when idle. */
  pullDistance: number;
  /** True when refresh fired and is awaiting completion. */
  refreshing: boolean;
}

/**
 * Wires pull-to-refresh to a scrollable container. Returns:
 *   - `containerRef` — attach to the scrolling element
 *   - `pullDistance` — for visual indicator (0 idle, 0–80 during pull)
 *   - `refreshing` — true while `onRefresh` is in flight
 *
 * Triggers `onRefresh()` when the user pulls past `PULL_THRESHOLD` while
 * the container is at scroll-top. The visual pull is damped so it feels
 * resistant past the threshold.
 *
 * Mobile-only by design: keyed on touch events, not pointer events. Desktop
 * users use the existing retry / refetch mechanisms.
 */
export function usePullToRefresh<T extends HTMLElement = HTMLElement>(
  onRefresh: () => void | Promise<void>,
) {
  const containerRef = useRef<T | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const tracking = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      // Only start tracking when the container is actually at scroll-top.
      // Nested scrollables can fire here too; ignore unless our target is at top.
      if (!el || el.scrollTop > 0) return;
      const t = e.touches[0];
      if (!t) return;
      startY.current = t.clientY;
      tracking.current = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!tracking.current || startY.current == null) return;
      const t = e.touches[0];
      if (!t) return;
      const dy = t.clientY - startY.current;
      if (dy <= 0) {
        // Scroll up — release tracking, let normal scroll take over.
        tracking.current = false;
        startY.current = null;
        setPullDistance(0);
        return;
      }
      // Damp the pull so it feels resistant past the threshold.
      const damped = Math.min(MAX_VISIBLE_PULL, dy / PULL_DAMPING);
      setPullDistance(damped);
    }

    function onTouchEnd() {
      if (!tracking.current) return;
      tracking.current = false;
      startY.current = null;
      const wasOverThreshold = pullDistance >= PULL_THRESHOLD;
      setPullDistance(0);
      if (wasOverThreshold) {
        setRefreshing(true);
        Promise.resolve(onRefresh())
          .finally(() => setRefreshing(false));
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [onRefresh, pullDistance]);

  return { containerRef, pullDistance, refreshing };
}
