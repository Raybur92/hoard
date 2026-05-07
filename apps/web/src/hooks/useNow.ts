import { useEffect, useState } from 'react';

/**
 * Returns a `Date.now()` timestamp that updates on a fixed cadence,
 * causing the consuming component to re-render. Pauses when the document
 * is hidden so a backgrounded tab doesn't burn battery, and re-syncs on
 * `visibilitychange`.
 *
 * Used by HeroCountdown to make the d/h/m/s box tick in real time
 * (see CLAUDE.md "feel alive" workstream, 2026-05-07).
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (id !== null) return;
      setNow(Date.now());
      id = setInterval(() => setNow(Date.now()), intervalMs);
    };

    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };

    const onVis = () => {
      if (document.hidden) stop();
      else start();
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [intervalMs]);

  return now;
}
