import type { CSSProperties, ReactNode } from 'react';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';

interface Props {
  onRefresh: () => void | Promise<void>;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Scrollable region with pull-to-refresh on mobile (touch). The children are
 * translated downward as the user pulls, and a small loading indicator
 * surfaces above them. On release past threshold, `onRefresh` is invoked.
 *
 * Includes the WCAG 2.1.1 keyboard-scrollable fix from PR 3:
 * `tabIndex={0}` + `role="region"` so Safari arrow-key scroll works.
 */
export function PullableScroll({ onRefresh, ariaLabel, className = 'thin-scroll', style, children }: Props) {
  const { containerRef, pullDistance, refreshing } = usePullToRefresh<HTMLDivElement>(onRefresh);
  const translate = refreshing ? 24 : pullDistance;
  return (
    <div
      ref={containerRef}
      className={className}
      // tabIndex on a scrollable region — Safari arrow-key scroll fix per
      // axe-core's scrollable-region-focusable rule. jsx-a11y disagrees but
      // WCAG 2.1.1 wins.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      role="region"
      aria-label={ariaLabel}
      aria-busy={refreshing}
      style={{ flex: 1, overflow: 'auto', overscrollBehavior: 'contain', position: 'relative', ...style }}
    >
      {(translate > 0 || refreshing) && (
        <div
          aria-live="polite"
          style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: translate, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--paper-dim)',
            fontFamily: 'var(--mono)', fontSize: 'var(--text-2xs)',
            letterSpacing: '0.1em', textTransform: 'uppercase',
            pointerEvents: 'none',
          }}
        >
          {refreshing ? '// refreshing…' : pullDistance > 56 ? '// release to refresh' : '// pull down…'}
        </div>
      )}
      <div style={{ transform: `translateY(${translate}px)`, transition: pullDistance > 0 ? 'none' : 'transform 0.18s ease-out' }}>
        {children}
      </div>
    </div>
  );
}
