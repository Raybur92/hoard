import { Icon } from '../../primitives/Icon';

export type MobileBannerMode = 'wishlist' | 'all';

export interface MobileBannerProps {
  mode: MobileBannerMode;
  starredCount: number;
  hypedCount: number;
  /** Top-N hyped titles by hype desc, used by the muted variant. Caller pre-sorts. */
  previewTitles?: string[];
  onViewRecent: () => void;
}

/**
 * Mobile-styled compact variant of `RecentBanner` (R5 of RELEASES_PLAN.md,
 * handoff §9 + §12 punch-list 3).
 *
 * Same conditional rules as the desktop banner (drives off the same data),
 * but compacted for mobile width:
 *   - Green-prominent: drops the subline ("they'll move to your library
 *     automatically once your platforms sync.") — handoff §12 punch-list 3
 *     explicitly allows this for mobile width. The eyebrow + view-recent
 *     button are the only interactive surface.
 *   - Muted: same single-line shape as desktop with ellipsized title list.
 *
 * Like the desktop banner, this is informational only — no `[mark all owned]`
 * button. The only interactive control is `[view recent →]`.
 */
export function MobileBanner({
  mode,
  starredCount,
  hypedCount,
  previewTitles = [],
  onViewRecent,
}: MobileBannerProps) {
  const showStarred = starredCount > 0;
  const showHyped = mode === 'all' && !showStarred && hypedCount > 0;
  if (!showStarred && !showHyped) return null;

  if (showStarred) {
    const both = mode === 'all' && hypedCount > 0;
    const eyebrow = both
      ? `${starredCount} starred · ${hypedCount} high-hype · last 14d`
      : `${starredCount} starred · last 14d`;
    return (
      <div
        role="status"
        style={{
          margin: '10px 16px 0',
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          border: '1px solid var(--green-dim)',
          background: 'rgba(95,194,106,0.04)',
        }}
      >
        <Icon name="check" size={14} style={{ color: 'var(--green)' }} />
        <span
          className="t-up t-mono"
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 'var(--text-3xs)',
            letterSpacing: '0.1em',
            color: 'var(--green)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          // {eyebrow}
        </span>
        <ViewRecentBtn onClick={onViewRecent} />
      </div>
    );
  }

  // Muted variant — All mode only. Same ellipsis rule as desktop (handoff §12
  // punch-list 4): preserve the trailing "+N · last 14d", ellipsize the
  // comma-separated title list.
  const top = previewTitles.slice(0, 2).join(', ');
  const remaining = hypedCount > 2 ? ` · +${hypedCount - 2}` : '';

  return (
    <div
      role="status"
      style={{
        margin: '10px 16px 0',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        border: '1px dashed var(--rule-bright)',
        background: 'transparent',
      }}
    >
      <Icon name="info" size={12} style={{ color: 'var(--paper-faint)' }} />
      <span
        className="t-faint t-mono"
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 'var(--text-3xs)',
          letterSpacing: '0.06em',
          display: 'flex',
          gap: 3,
          alignItems: 'baseline',
        }}
      >
        <span style={{ flex: '0 0 auto' }}>// {hypedCount} high-hype ·&nbsp;</span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {top}
        </span>
        <span style={{ flex: '0 0 auto' }}>{remaining} · last 14d</span>
      </span>
      <ViewRecentBtn onClick={onViewRecent} />
    </div>
  );
}

function ViewRecentBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="View releases that dropped in the last 14 days"
      style={{
        flex: '0 0 auto',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        fontFamily: 'var(--mono)',
        fontSize: 'var(--text-3xs)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        background: 'transparent',
        color: 'var(--paper)',
        border: '1px solid var(--rule-bright)',
        cursor: 'pointer',
      }}
    >
      recent <Icon name="back" size={10} style={{ transform: 'scaleX(-1)' }} />
    </button>
  );
}
