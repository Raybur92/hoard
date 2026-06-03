import { useState, useEffect } from 'react';

export type Breakpoint = 'desktop' | 'mobile';

const OVERRIDE_KEY = 'hoard:bp';

// Dev-only manual override so the layout can be pinned to a breakpoint
// regardless of window width — useful for reviewing the mobile shell on a
// desktop browser (and for automated UI audits where the viewport can't be
// shrunk below 1024px). Activate with `?bp=mobile` / `?bp=desktop`; the
// choice persists to localStorage so it survives in-app navigation. Clear it
// with `?bp=auto`. With no override the hook is width-based exactly as
// before, so real users are never affected unless they opt in by hand.
// NOTE: this only forces the React layout branch; it cannot reproduce
// iOS-standalone-specific behaviour (safe-area insets, dvh) — see
// docs/MOBILE_TESTING.md.
function readBreakpointOverride(): Breakpoint | null {
  if (typeof window === 'undefined') return null;
  try {
    const q = new URLSearchParams(window.location.search).get('bp');
    if (q === 'mobile' || q === 'desktop') {
      window.localStorage.setItem(OVERRIDE_KEY, q);
      return q;
    }
    if (q === 'auto') {
      window.localStorage.removeItem(OVERRIDE_KEY);
      return null;
    }
    const stored = window.localStorage.getItem(OVERRIDE_KEY);
    if (stored === 'mobile' || stored === 'desktop') return stored;
  } catch {
    // localStorage unavailable (private mode etc.) — fall through to width.
  }
  return null;
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() => {
    const override = readBreakpointOverride();
    if (override) return override;
    return typeof window !== 'undefined' && window.innerWidth >= 1024 ? 'desktop' : 'mobile';
  });

  useEffect(() => {
    // An active override pins the breakpoint — ignore width changes.
    if (readBreakpointOverride()) return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => setBp(e.matches ? 'desktop' : 'mobile');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return bp;
}
