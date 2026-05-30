import type { IgdbUpcomingRelease } from '@hoard/types';
import { Cover } from '../../primitives/Cover';
import { Plat } from '../../primitives/Plat';
import { HypeBars } from '../../primitives/HypeBars';
import { Btn } from '../../primitives/Btn';
import { Icon } from '../../primitives/Icon';
import { Marker } from '../../primitives/Marker';
import { countdownParts, daysUntil, upcomingDateParts } from '../../../lib/utils';
import { useNow } from '../../../hooks/useNow';
import { toPlatCode, hypeToBars, pickWishlistedPlatformChips } from './utils';

export interface HeroCountdownProps {
  release: IgdbUpcomingRelease;
  onToggleWishlist?: (igdbId: number) => void;
}

/**
 * The Wishlist-mode hero countdown (R2 of RELEASES_PLAN.md).
 *
 * Always shows the user's "next starred globally" — handoff §5 + decision D5.
 * Hero hides when no future starred exists; the parent screen is responsible
 * for that gating, this component just renders a release.
 *
 * Action buttons (D6): only `[on wishlist]` ships in v1. The mock includes
 * `[trailer]` and `[remind me]` — both deliberately omitted here:
 *   - [trailer] needs IGDB videos[] capture + YouTube embed (not built)
 *   - [remind me] needs notification infrastructure (Settings → Notifications
 *     is a v2 ComingSoonPanel — see PR A — A6)
 *
 * Layout: 180×240 cover + meta column. Same shape as the Pragmata mock at
 * rev07 line 2406-2448.
 */
export function HeroCountdown({ release, onToggleWishlist }: HeroCountdownProps) {
  // Live 1Hz tick — pauses when the tab is hidden. The d/h/m/s grid below
  // re-renders every second so the countdown stays honest.
  const now = useNow(1000);
  const cd = countdownParts(release.releaseDate, now);
  const away = daysUntil(release.releaseDate, now);
  const dateParts = upcomingDateParts(release.releaseDate);
  const isWishlisted = release.wishlisted;

  return (
    <div className="panel" style={{
      padding: 24, display: 'grid', gridTemplateColumns: '180px 1fr', gap: 24, alignItems: 'start',
      borderColor: 'var(--amber-dim)',
    }}>
      <Cover
        w={180}
        h={240}
        src={release.coverUrl}
        label={(release.title.split(' ')[0] ?? release.title).toUpperCase()}
        dev={release.developer ?? '—'}
        year={dateParts.full.split(',')[1]?.trim() ?? null}
        bright
      />

      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <Marker style={{ color: 'var(--amber)' }}>// next on your wishlist · {away} days away</Marker>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
              <span className="t-display" style={{ fontSize: 48, lineHeight: 0.85, color: 'var(--amber)' }}>
                T-{away}
              </span>
              <div>
                <div style={{ fontSize: 'var(--text-lg)', lineHeight: 1.05, color: 'var(--paper)', letterSpacing: '-0.01em' }}>
                  {release.title}
                </div>
                <div className="t-mono t-dim" style={{ fontSize: 'var(--text-xs)', marginTop: 4 }}>
                  {release.developer ?? '—'}
                  {release.genres[0] && ` · ${release.genres[0]}`}
                </div>
              </div>
            </div>
          </div>

          {cd && (
            <div style={{ flex: '0 0 auto', display: 'flex', gap: 4 }}>
              {([['d', cd.d], ['h', cd.h], ['m', cd.m], ['s', cd.s]] as [string, string][]).map(([k, v]) => (
                <div key={k} style={{
                  background: 'var(--ink-2)', border: '1px solid var(--rule-bright)',
                  padding: '6px 8px', textAlign: 'center', minWidth: 38,
                }}>
                  <div className="t-mono t-tnum" style={{ fontSize: 'var(--text-md)', color: 'var(--amber)', lineHeight: 1 }}>{v}</div>
                  <div className="t-faint t-up" style={{ fontSize: 'var(--text-3xs)', marginTop: 3 }}>{k.toUpperCase()}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, fontSize: 'var(--text-xs)' }}>
          <div>
            <div className="t-up t-faint" style={{ fontSize: 'var(--text-2xs)' }}>release</div>
            <div className="t-tnum" style={{ marginTop: 4, color: 'var(--paper)' }}>{dateParts.full}</div>
          </div>
          <div>
            <div className="t-up t-faint" style={{ fontSize: 'var(--text-2xs)' }}>day</div>
            <div className="t-tnum" style={{ marginTop: 4 }}>{dateParts.dow.toLowerCase()}</div>
          </div>
          {(() => {
            // REL-PR1 — if the user wishlisted on a subset of the release's
            // platforms, show that subset under a `wishlisted on` label
            // instead of the generic `platforms` heading. Empty / full-set
            // wishlistedPlatforms falls back to the original rendering.
            const platformList = pickWishlistedPlatformChips(release);
            const isScoped = platformList.mode === 'wishlist';
            return (
              <div>
                <div className="t-up t-faint" style={{ fontSize: 'var(--text-2xs)', color: isScoped ? 'var(--amber)' : undefined }}>
                  {isScoped ? 'wishlisted on' : 'platforms'}
                </div>
                <div style={{ marginTop: 4, display: 'flex', gap: 4 }}>
                  {platformList.platforms.map((p) => <Plat key={p} code={toPlatCode(p)} lg />)}
                </div>
              </div>
            );
          })()}
          {release.hype !== null && release.hype > 0 && (
            <div>
              <div className="t-up t-faint" style={{ fontSize: 'var(--text-2xs)' }}>hype</div>
              <div style={{ marginTop: 6 }}><HypeBars n={hypeToBars(release.hype)} /></div>
            </div>
          )}
        </div>

        {release.synopsis && (
          <div className="t-sans" style={{ marginTop: 16, fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--paper-dim)' }}>
            {release.synopsis}
          </div>
        )}

        <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* D6: only [on wishlist] in v1. [trailer] / [remind me] parked for v2. */}
          {onToggleWishlist && (
            <Btn
              {...(isWishlisted ? { variant: 'amber' as const } : {})}
              sm
              onClick={() => onToggleWishlist(release.igdbId)}
              ariaLabel={isWishlisted ? `Stop tracking ${release.title}` : `Add ${release.title} to wishlist`}
            >
              <Icon name="star" size={11} fill={isWishlisted} />
              {isWishlisted ? 'on wishlist' : '+ wishlist'}
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
}
