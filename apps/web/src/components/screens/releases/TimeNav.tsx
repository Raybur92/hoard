export type TimeNavZoom = 'months' | 'quarters';
export type TimeNavMode = 'wishlist' | 'all';

export interface TimeBucket {
  /** Stable identifier — e.g. 'MAY' for months, 'Q3 2026' for quarters, 'TBA' for either. */
  key: string;
  /** Display label — typically the same as key minus the year suffix. */
  label: string;
  /** Trailing year/meta label, optional ('2026', '—', etc.). */
  meta?: string;
  /** Count of releases in this bucket within the current scope. */
  count: number;
  /** True for the TBA / dateless bucket — renders a hatched diagonal pattern instead of a count bar. */
  isTBA?: boolean;
}

export interface TimeNavProps {
  buckets: TimeBucket[];
  activeKey: string;
  zoom: TimeNavZoom;
  mode: TimeNavMode;
  onSelect: (key: string) => void;
  onZoomChange: (zoom: TimeNavZoom) => void;
}

/**
 * Desktop time strip for the Releases page (R2 of RELEASES_PLAN.md).
 *
 * Renders a horizontal strip of buckets with relative-magnitude bars + counts,
 * plus a `MONTHS · QUARTERS` zoom toggle on the right. The active bucket gets
 * a 2px amber underline and a brighter count.
 *
 * The TBA bucket — handoff §12 punch-list item 7 — renders with a hatched
 * diagonal pattern instead of a 0-fill bar. A 0-fill bar would lie about the
 * data ("there's nothing here"); the hatch communicates "this exists but
 * isn't measurable on this scale."
 *
 * Bar magnitude is normalized against the max non-TBA count, so the busiest
 * bucket fills its bar fully and the rest scale relative to it. Empty buckets
 * still get a thin 6% fill so they're visually present.
 *
 * Note: the bucket strip is desktop-only — mobile uses MobileViewHeader +
 * MobileViewSheet (R5).
 */
export function TimeNav({ buckets, activeKey, zoom, mode, onSelect, onZoomChange }: TimeNavProps) {
  const datedBuckets = buckets.filter((b) => !b.isTBA);
  const max = Math.max(1, ...datedBuckets.map((b) => b.count));
  const barWidth = 72;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, paddingTop: 4 }}>
      <div role="tablist" aria-label="Time bucket" style={{ display: 'flex', alignItems: 'flex-end' }}>
        {buckets.map((b) => {
          const active = b.key === activeKey;
          const pct = b.isTBA ? 0 : Math.max(0.06, b.count / max);
          return (
            <button
              key={b.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(b.key)}
              style={{
                flex: '0 0 auto',
                padding: '10px 18px 12px',
                borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                borderBottom: active ? '2px solid var(--amber)' : '2px solid transparent',
                background: 'transparent',
                cursor: 'pointer',
                minWidth: barWidth + 36,
                fontFamily: 'inherit',
                color: 'inherit',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 'var(--text-2xs)', letterSpacing: '0.12em',
                  color: active ? 'var(--paper)' : 'var(--paper-dim)',
                  textTransform: 'uppercase',
                }}>{b.label}</span>
                <span className="t-tnum" style={{
                  fontFamily: 'var(--display)', fontSize: 'var(--text-md)', lineHeight: 1,
                  color: active ? 'var(--amber)' : 'var(--paper)',
                }}>{b.count}</span>
              </div>
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, height: 6 }}>
                {b.isTBA ? (
                  <div style={{
                    width: barWidth, height: 6, border: '1px solid var(--rule)',
                    backgroundImage: 'repeating-linear-gradient(45deg, var(--rule-bright) 0 3px, transparent 3px 6px)',
                  }} aria-label="No date — magnitude not applicable" />
                ) : (
                  <div style={{ width: barWidth, height: 6, background: 'var(--ink-2)', border: '1px solid var(--rule)', position: 'relative' }}>
                    <div style={{
                      position: 'absolute', inset: 0, width: `${pct * 100}%`,
                      background: active ? 'var(--amber)' : (mode === 'wishlist' ? 'var(--amber-dim)' : 'var(--paper-faint)'),
                    }} />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* MONTHS · QUARTERS zoom toggle */}
      <div role="tablist" aria-label="Zoom level" style={{ paddingBottom: 12, paddingRight: 4 }}>
        <div style={{ display: 'inline-flex', border: '1px solid var(--rule-bright)' }}>
          {([['months', 'MONTHS'], ['quarters', 'QUARTERS']] as Array<[TimeNavZoom, string]>).map(([k, label], i) => {
            const active = zoom === k;
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onZoomChange(k)}
                style={{
                  padding: '5px 10px',
                  fontFamily: 'var(--mono)', fontSize: 'var(--text-3xs)', letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: active ? 'var(--void)' : 'var(--paper-dim)',
                  background: active ? 'var(--paper)' : 'transparent',
                  border: 'none',
                  borderLeft: i === 0 ? 'none' : '1px solid var(--rule-bright)',
                  cursor: 'pointer',
                }}
              >{label}</button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
