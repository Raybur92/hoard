import { Icon } from '../../primitives/Icon';

export type RecentBannerMode = 'wishlist' | 'all';

export interface RecentBannerProps {
  mode: RecentBannerMode;
  starredCount: number;
  hypedCount: number;
  /** Top-N hyped titles by hype desc, used by the muted variant. Caller pre-sorts. */
  previewTitles?: string[];
  onViewRecent: () => void;
}

/**
 * Conditional banner above the time strip on Releases (R2 of RELEASES_PLAN.md).
 *
 * Two visual treatments per handoff §4:
 *
 *   - **Green-prominent** — fires when ≥1 starred drop in the last 14 days.
 *     In All mode, if there are ALSO hyped drops, the count gets folded into
 *     the eyebrow line: "// 2 starred · 3 high-hype · last 14 days".
 *
 *   - **Muted** — fires only in All mode when no starred drops but ≥1 hyped
 *     drop (hype >= 80) in the last 14d. Single-line, dashed border. Top 2
 *     titles by hype + "+N" for the rest.
 *
 *   - **Hidden** — neither condition applies.
 *
 * The banner is informational only — handoff §9 explicitly removes the
 * `[mark all owned]` button (it appears in the rev07 mock but is not part
 * of the final spec; see RELEASES_PLAN.md mock-vs-handoff drift table).
 * The only interactive control is `[view recent →]`, which navigates.
 *
 * Copy is pulled from handoff §9 (NOT the rev07 mock copy, which still says
 * "mark them as owned to move them out of your wishlist and into your
 * library." — outdated).
 */
export function RecentBanner({ mode, starredCount, hypedCount, previewTitles = [], onViewRecent }: RecentBannerProps) {
  const showStarred = starredCount > 0;
  const showHyped = mode === 'all' && !showStarred && hypedCount > 0;
  if (!showStarred && !showHyped) return null;

  if (showStarred) {
    const both = mode === 'all' && hypedCount > 0;
    const eyebrow = both
      ? `${starredCount} starred · ${hypedCount} high-hype · last 14 days`
      : `${starredCount} starred release${starredCount === 1 ? '' : 's'} dropped in the last 14 days`;
    return (
      <div role="status" style={{
        padding: '12px 18px',
        display: 'flex', alignItems: 'center', gap: 14,
        border: '1px solid var(--green-dim)',
        background: 'rgba(95,194,106,0.04)',
      }}>
        <Icon name="check" size={16} style={{ color: 'var(--green)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t-up" style={{ fontSize: 'var(--text-3xs)', letterSpacing: '0.12em', color: 'var(--green)' }}>
            // {eyebrow}
          </div>
          <div className="t-faint" style={{ fontSize: 'var(--text-2xs)', marginTop: 3 }}>
            they&rsquo;ll move to your library automatically once your platforms sync.
          </div>
        </div>
        <button
          type="button"
          onClick={onViewRecent}
          aria-label="View releases that dropped in the last 14 days"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', fontFamily: 'var(--mono)', fontSize: 'var(--text-2xs)',
            letterSpacing: '0.1em', textTransform: 'uppercase',
            background: 'transparent', color: 'var(--paper)',
            border: '1px solid var(--rule-bright)', cursor: 'pointer',
          }}
        >
          view recent <Icon name="arrowR" size={11} />
        </button>
      </div>
    );
  }

  // showHyped — muted variant.
  // Ellipsize the comma-separated title list, NOT the whole line.
  // The "+N" and "· last 14 days" should always be visible (handoff §9 +
  // punch-list item 4 in §12). Achieved here by giving the title list a
  // separate min-width:0 + overflow:hidden span, while the trailing
  // "+N · last 14 days" runs alongside in its own span.
  const top = previewTitles.slice(0, 2).join(', ');
  const remaining = hypedCount > 2 ? ` · +${hypedCount - 2}` : '';

  return (
    <div role="status" style={{
      padding: '10px 18px',
      display: 'flex', alignItems: 'center', gap: 14,
      border: '1px dashed var(--rule-bright)',
      background: 'transparent',
    }}>
      <Icon name="info" size={14} style={{ color: 'var(--paper-faint)' }} />
      <div className="t-faint t-mono" style={{
        flex: 1, fontSize: 'var(--text-2xs)', letterSpacing: '0.06em',
        minWidth: 0, display: 'flex', gap: 4, alignItems: 'baseline',
      }}>
        <span style={{ flex: '0 0 auto' }}>// {hypedCount} high-hype ·&nbsp;</span>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {top}
        </span>
        <span style={{ flex: '0 0 auto' }}>{remaining} · last 14 days</span>
      </div>
      <button
        type="button"
        onClick={onViewRecent}
        aria-label="View releases that dropped in the last 14 days"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', fontFamily: 'var(--mono)', fontSize: 'var(--text-2xs)',
          letterSpacing: '0.1em', textTransform: 'uppercase',
          background: 'transparent', color: 'var(--paper)',
          border: '1px solid var(--rule-bright)', cursor: 'pointer',
        }}
      >
        view recent <Icon name="arrowR" size={11} />
      </button>
    </div>
  );
}
