import type { IgdbUpcomingRelease } from '@hoard/types';
import { Cover } from '../../primitives/Cover';
import { Plat } from '../../primitives/Plat';
import { HypeBars } from '../../primitives/HypeBars';
import { Icon } from '../../primitives/Icon';
import { daysUntil } from '../../../lib/utils';
import { toPlatCode, hypeToBars, releaseDateColumn, categoryLabel } from './utils';

export type ReleaseCardVariant = 'wishlist' | 'all' | 'recent';

export interface ReleaseCardProps {
  release: IgdbUpcomingRelease;
  variant?: ReleaseCardVariant;
  onToggleWishlist?: ((igdbId: number) => void) | undefined;
  /**
   * Card body click → game detail. Star button still toggles wishlist
   * independently (its onClick stops propagation). When omitted, the card
   * renders as a plain div — used by the wishlist-empty recommendation
   * panel where the cards already have their own row layout.
   */
  onClick?: ((igdbId: number) => void) | undefined;
}

/**
 * Card primitive for the Releases page (R2 of RELEASES_PLAN.md).
 *
 * Single component, three variants — handoff §5:
 *   - 'wishlist' — Wishlist mode grid item. No hype bars (every starred item
 *                  is by definition wanted; bars add noise).
 *   - 'all'      — All-Releases mode grid item. Hype bars surface relative
 *                  anticipation across un-curated rows.
 *   - 'recent'   — RECENT page card. Footer state shows "dropped Nd ago"
 *                  instead of "T-Nd". NO `[i got it]` button — handoff §5
 *                  + §10 explicitly remove it; library sync handles
 *                  ownership transitions automatically.
 *
 * Layout: 60px / 76px / 1fr grid (date column / cover / title-meta), per
 * the rev07 mock. Mobile uses a different 40/36/1fr/auto layout — that lives
 * elsewhere; don't reuse this component on mobile.
 */
export function ReleaseCard({ release, variant = 'all', onToggleWishlist, onClick }: ReleaseCardProps) {
  const date = releaseDateColumn(release);
  const away = daysUntil(release.releaseDate);
  const isPast = release.releaseDate !== null && away < 0;
  const isWishlisted = release.wishlisted;
  const cat = categoryLabel(release.category);
  const showHype = variant === 'all';
  const platforms = release.platforms.slice(0, 3);

  // Card body click → onClick(igdbId). Implemented with role="button" +
  // tabIndex + keyboard handler (NOT a real <button>) because the star
  // toggle is a real <button> that lives inside the card, and nested
  // buttons are invalid HTML. The star's onClick stops propagation so a
  // star tap doesn't double-fire the card click.
  const interactive = Boolean(onClick);
  const handleCardActivate = () => onClick?.(release.igdbId);

  return (
    <div
      {...(interactive
        ? {
            role: 'button' as const,
            tabIndex: 0,
            onClick: handleCardActivate,
            onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleCardActivate();
              }
            },
            'aria-label': `Open ${release.title}`,
          }
        : {})}
      style={{
        display: 'grid', gridTemplateColumns: '60px 76px 1fr', gap: 14,
        padding: 14, border: '1px solid var(--rule)', background: 'var(--ink)',
        position: 'relative',
        ...(interactive ? { cursor: 'pointer' } : {}),
      }}>
      <div style={{ textAlign: 'center', borderRight: '1px dashed var(--rule-bright)', paddingRight: 8 }}>
        <div className="t-up t-faint" style={{ fontSize: 'var(--text-3xs)' }}>{date.month}</div>
        <div className="t-display" style={{
          fontSize: 'var(--text-xl)',
          color: isWishlisted ? 'var(--amber)' : 'var(--paper)',
          lineHeight: 1, marginTop: 3,
        }}>{date.day}</div>
        <div className="t-mono t-faint" style={{ fontSize: 'var(--text-3xs)', marginTop: 3 }}>{date.dow}</div>
      </div>

      <Cover
        w={76}
        h={100}
        src={release.coverUrl}
        label={(release.title.split(' ')[0] ?? release.title).toUpperCase()}
        bright={isWishlisted}
      />

      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
          <div style={{ fontSize: 'var(--text-base)', color: 'var(--paper)', lineHeight: 1.15, flex: 1 }}>
            {release.title}
          </div>
          {onToggleWishlist ? (
            <button
              type="button"
              onClick={(e) => {
                // Don't bubble up to the card-body navigation handler.
                e.stopPropagation();
                onToggleWishlist(release.igdbId);
              }}
              aria-label={isWishlisted ? `Stop tracking ${release.title}` : `Add ${release.title} to wishlist`}
              aria-pressed={isWishlisted}
              style={{
                background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                color: isWishlisted ? 'var(--amber)' : 'var(--paper-faint)',
                flex: '0 0 auto',
              }}
            >
              <Icon name={isWishlisted ? 'starF' : 'star'} size={13} fill={isWishlisted} />
            </button>
          ) : (
            <Icon
              name={isWishlisted ? 'starF' : 'star'}
              size={13}
              fill={isWishlisted}
              style={{ color: isWishlisted ? 'var(--amber)' : 'var(--paper-faint)', flex: '0 0 auto' }}
            />
          )}
        </div>

        {release.developer && (
          <div className="t-mono t-faint" style={{ fontSize: 'var(--text-3xs)', marginTop: 2 }}>{release.developer}</div>
        )}

        {(release.genres[0] || cat) && (
          <div className="t-faint" style={{ fontSize: 'var(--text-2xs)', marginTop: 4 }}>
            {release.genres[0] ?? '—'}
            {cat === 'DLC' && <span style={{ color: 'var(--blue)', marginLeft: 6 }}>· DLC</span>}
            {cat === 'REMAKE' && <span style={{ color: 'var(--magenta, var(--amber))', marginLeft: 6 }}>· REMAKE</span>}
          </div>
        )}

        {platforms.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
            {platforms.map((p) => <Plat key={p} code={toPlatCode(p)} />)}
          </div>
        )}

        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
          {/* Footer state: T-N for future, "dropped Nd ago" for past. NO
              [i got it] button — handoff §5 + §10. Library sync owns
              ownership transitions. */}
          {isPast ? (
            <span className="t-faint" style={{ fontSize: 'var(--text-3xs)', fontFamily: 'var(--mono)' }}>
              dropped {Math.abs(away)}d ago
            </span>
          ) : (
            <span className="t-tnum" style={{
              fontSize: 'var(--text-2xs)', fontFamily: 'var(--mono)',
              color: isWishlisted ? 'var(--amber)' : 'var(--paper-dim)',
            }}>{release.releaseDate ? `T-${away}d` : 'TBA'}</span>
          )}
          {showHype && release.hype !== null && release.hype > 0 && (
            <HypeBars n={hypeToBars(release.hype)} />
          )}
        </div>
      </div>
    </div>
  );
}
