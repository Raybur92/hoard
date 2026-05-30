import type { IgdbUpcomingRelease } from '@hoard/types';
import { Cover } from '../../primitives/Cover';
import { Icon } from '../../primitives/Icon';
import { daysUntil } from '../../../lib/utils';
import { toPlatCode, releaseDateColumn, categoryLabel, pickWishlistedPlatformChips } from './utils';

export interface MobileReleaseRowProps {
  release: IgdbUpcomingRelease;
  /** Optional star toggle. Omit for the RECENT page where wishlisting is moot. */
  onToggleWishlist?: ((igdbId: number) => void) | undefined;
  /**
   * Optional row tap → navigates to the game detail page. Receives the
   * release's `userGameId` (string, never null). Only invoked when the
   * release has a UserGame row in the user's library — releases without
   * one render non-tappable, so the parent's `(id) => navigate(/game/${id})`
   * never fires with a phantom igdbId.
   */
  onTap?: ((userGameId: string) => void) | undefined;
}

/**
 * Mobile list row for the Releases page (R5 of RELEASES_PLAN.md, handoff §12
 * punch-list 2).
 *
 * Layout: `40px 36px 1fr auto` grid — date column / 36×48 cover / title-meta /
 * T-N + star. This pattern is intentional and divergent from desktop's
 * `ReleaseCard` (60/76/1fr). Don't try to unify the two.
 *
 * Footer state mirrors the desktop card (handoff §5):
 *   - Future date  → `T-Nd`
 *   - Past date    → `dropped Nd ago` (used by the RECENT page)
 *   - Dateless     → `TBA`
 *
 * No `[i got it]` button anywhere — handoff §5 + §10 explicitly remove it.
 */
export function MobileReleaseRow({ release, onToggleWishlist, onTap }: MobileReleaseRowProps) {
  const date = releaseDateColumn(release);
  const away = daysUntil(release.releaseDate);
  const isPast = release.releaseDate !== null && away < 0;
  const isWishlisted = release.wishlisted;
  const cat = categoryLabel(release.category);
  // REL-PR1 — when the user wishlisted on a strict subset of the release's
  // platforms, narrow the platform line to that subset (prefixed `wish:`).
  // Falls back to the generic platform list when no narrowing applies.
  const platformList = pickWishlistedPlatformChips(release);
  const platStr = platformList.platforms.slice(0, 4).map(toPlatCode).join('·');
  const platformsAreWishlistScoped = platformList.mode === 'wishlist';

  // Tap is meaningful only when we have a UserGame to navigate to. Otherwise
  // the title button renders disabled — clicking does nothing rather than
  // routing to /game/${igdbId} (which would 404).
  const tapTitle = onTap && release.userGameId
    ? () => onTap(release.userGameId!)
    : undefined;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '40px 36px 1fr auto',
        gap: 10,
        padding: '10px 0',
        alignItems: 'center',
        borderBottom: '1px dotted var(--rule-bright)',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div className="t-up t-faint" style={{ fontSize: 'var(--text-3xs)' }}>{date.month}</div>
        <div
          className="t-display"
          style={{
            fontSize: 'var(--text-md)',
            color: isWishlisted ? 'var(--amber)' : 'var(--paper)',
            lineHeight: 1,
            marginTop: 2,
          }}
        >
          {date.day}
        </div>
      </div>

      <Cover
        w={36}
        h={48}
        src={release.coverUrl}
        label={(release.title[0] ?? '').toUpperCase()}
        bright={isWishlisted}
      />

      <button
        type="button"
        onClick={tapTitle}
        disabled={!tapTitle}
        aria-label={tapTitle ? `Open ${release.title}` : undefined}
        style={{
          minWidth: 0,
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          padding: 0,
          color: 'inherit',
          cursor: tapTitle ? 'pointer' : 'default',
        }}
      >
        <div
          style={{
            fontSize: 'var(--text-xs)',
            lineHeight: 1.15,
            color: 'var(--paper)',
            display: 'flex',
            alignItems: 'baseline',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {release.title}
          </span>
          {cat && (
            <span
              className="t-mono t-faint"
              style={{ fontSize: 'var(--text-3xs)', letterSpacing: '0.06em' }}
            >
              {cat.toLowerCase()}
            </span>
          )}
        </div>
        <div
          className="t-faint"
          style={{
            fontSize: 'var(--text-3xs)',
            marginTop: 2,
            display: 'flex',
            alignItems: 'baseline',
            gap: 6,
          }}
        >
          {release.developer && <span>{release.developer}</span>}
          {platStr && (
            <span>
              · {platformsAreWishlistScoped && (
                <span className="t-amber" style={{ marginRight: 3 }}>wish:</span>
              )}{platStr}
            </span>
          )}
        </div>
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <span
          className="t-tnum t-mono"
          style={{
            fontSize: 'var(--text-2xs)',
            color: isWishlisted ? 'var(--amber)' : 'var(--paper-dim)',
          }}
        >
          {!release.releaseDate
            ? 'TBA'
            : isPast
              ? `dropped ${Math.abs(away)}d ago`
              : `T-${away}d`}
        </span>
        {onToggleWishlist && (
          <button
            type="button"
            onClick={() => onToggleWishlist(release.igdbId)}
            aria-pressed={isWishlisted}
            aria-label={isWishlisted ? `Stop tracking ${release.title}` : `Add ${release.title} to wishlist`}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 4,
              margin: -4,
              cursor: 'pointer',
              color: isWishlisted ? 'var(--amber)' : 'var(--paper-faint)',
            }}
          >
            <Icon name="star" size={12} fill={isWishlisted} />
          </button>
        )}
      </div>
    </div>
  );
}
