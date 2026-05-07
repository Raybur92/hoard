import { useMemo } from 'react';
import type { IgdbUpcomingRelease } from '@hoard/types';
import { Cover } from '../../primitives/Cover';
import { HypeBars } from '../../primitives/HypeBars';
import { Icon } from '../../primitives/Icon';
import { Marker } from '../../primitives/Marker';
import { useUpcoming } from '../../../hooks/useUpcoming';
import { hypeToBars, releaseDateColumn } from './utils';

export interface WishlistEmptyRecommendationProps {
  /** Compact = mobile width / desktop empty state column. */
  layout?: 'desktop' | 'mobile';
  onToggleWishlist: (igdbId: number) => void;
}

/**
 * Recommendation panel rendered alongside the wishlist-empty state per
 * handoff §11 — "// hot this month · on your platforms" with 3
 * starred-eligible releases, HypeBars, and quick-add `+ wishlist` buttons.
 *
 * Pulls from `useUpcoming('my-platforms')` which is hype-filtered server-side
 * via the user's `User.hypeThreshold` setting. Sort is by IGDB hype desc.
 *
 * If `my-platforms` returns nothing (user has no connected platforms or
 * everything's filtered out), the recommendation panel renders nothing —
 * the parent's main empty-state copy carries the experience alone.
 *
 * Why this is needed: the bare wishlist-empty state is a dead-end. The
 * recommendation gives users an immediate, actionable next step using data
 * we already have client-side via SWR cache (the parent typically has it).
 */
export function WishlistEmptyRecommendation({
  layout = 'desktop',
  onToggleWishlist,
}: WishlistEmptyRecommendationProps) {
  const { data: feed } = useUpcoming('my-platforms');

  const top: IgdbUpcomingRelease[] = useMemo(() => {
    if (!feed || feed.length === 0) return [];
    const todayMs = Date.now();
    return feed
      .filter((r) => {
        if (!r.releaseDate) return true;
        return new Date(r.releaseDate).getTime() >= todayMs - 86_400_000;
      })
      .slice()
      .sort((a, b) => (b.hype ?? 0) - (a.hype ?? 0))
      .slice(0, 3);
  }, [feed]);

  if (top.length === 0) return null;

  const isMobile = layout === 'mobile';

  return (
    <div
      className="panel"
      style={{
        marginTop: isMobile ? 14 : 24,
        padding: isMobile ? 14 : 18,
      }}
    >
      <Marker>// hot this month · on your platforms</Marker>
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: isMobile ? 10 : 12,
        }}
      >
        {top.map((r) => (
          <RecommendationRow
            key={r.igdbId}
            release={r}
            isMobile={isMobile}
            onToggleWishlist={onToggleWishlist}
          />
        ))}
      </div>
    </div>
  );
}

function RecommendationRow({
  release,
  isMobile,
  onToggleWishlist,
}: {
  release: IgdbUpcomingRelease;
  isMobile: boolean;
  onToggleWishlist: (igdbId: number) => void;
}) {
  const date = releaseDateColumn(release);
  const bars = hypeToBars(release.hype);
  const coverW = isMobile ? 36 : 48;
  const coverH = isMobile ? 48 : 64;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `${coverW}px 1fr auto`,
        gap: 12,
        alignItems: 'center',
      }}
    >
      <Cover
        w={coverW}
        h={coverH}
        src={release.coverUrl}
        label={(release.title[0] ?? '').toUpperCase()}
      />

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--paper)',
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {release.title}
        </div>
        <div
          className="t-faint"
          style={{
            fontSize: 'var(--text-3xs)',
            marginTop: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>{date.month} {date.day}</span>
          <HypeBars n={bars} />
        </div>
      </div>

      <button
        type="button"
        onClick={() => onToggleWishlist(release.igdbId)}
        aria-label={`Add ${release.title} to wishlist`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 10px',
          minHeight: 36,
          fontFamily: 'var(--mono)',
          fontSize: 'var(--text-3xs)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          background: 'transparent',
          color: 'var(--amber)',
          border: '1px solid var(--amber)',
          cursor: 'pointer',
        }}
      >
        <Icon name="plus" size={11} />
        wishlist
      </button>
    </div>
  );
}
