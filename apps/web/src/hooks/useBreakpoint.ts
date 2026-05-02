import { useState, useEffect } from 'react';

export type Breakpoint = 'desktop' | 'mobile';

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 1024 ? 'desktop' : 'mobile'
  );

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => setBp(e.matches ? 'desktop' : 'mobile');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return bp;
}
