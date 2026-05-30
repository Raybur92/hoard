import { Link } from 'react-router-dom';
import type { WishlistRelease } from '@hoard/types';
import { Marker } from '../../primitives/Marker';
import { Icon } from '../../primitives/Icon';
import { countdownParts, daysUntil, formatReleaseDate } from '../../../lib/utils';
import { useNow } from '../../../hooks/useNow';

export interface NextReleaseCountdownProps {
  release: WishlistRelease;
}

/**
 * Compact span-3 countdown card for the Dashboard bento grid (DASH-PR1).
 *
 * Per PAGES_PLAN §7.4 — shows the next-soonest wishlisted release with a
 * live-ticking d/h/m/s grid and a [see all →] link to /releases. Distinct
 * from the wider /releases HeroCountdown (180×240 cover) — this card is
 * deliberately narrow to fit a span-3 bento slot. Tick logic + countdownParts
 * helper match the /releases hero so behaviour is consistent.
 */
export function NextReleaseCountdown({ release }: NextReleaseCountdownProps) {
  const now = useNow(1000);
  const cd = countdownParts(release.releaseDate, now);
  const away = daysUntil(release.releaseDate, now);

  return (
    <div className="panel" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Marker style={{ color: 'var(--amber)' }}>// next release</Marker>
        <span className="t-tnum t-amber" style={{ fontSize: 'var(--text-xs)' }}>
          {release.releaseDate ? `T-${away}` : 'TBA'}
        </span>
      </div>

      <div style={{ fontSize: 'var(--text-md)', lineHeight: 1.1, color: 'var(--paper)', letterSpacing: '-0.01em' }}>
        {release.title}
      </div>

      <div className="t-mono t-tnum t-faint" style={{ fontSize: 'var(--text-2xs)' }}>
        {formatReleaseDate(release.releaseDate)}
      </div>

      {cd ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {([['d', cd.d], ['h', cd.h], ['m', cd.m], ['s', cd.s]] as [string, string][]).map(([k, v]) => (
            <div key={k} style={{
              background: 'var(--ink-2)', border: '1px solid var(--rule-bright)',
              padding: '6px 4px', textAlign: 'center',
            }}>
              <div className="t-mono t-tnum" style={{ fontSize: 'var(--text-md)', color: 'var(--amber)', lineHeight: 1 }}>{v}</div>
              <div className="t-faint t-up" style={{ fontSize: 'var(--text-3xs)', marginTop: 3 }}>{k.toUpperCase()}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="t-mono t-faint" style={{ fontSize: 'var(--text-2xs)' }}>release date tba</div>
      )}

      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
        <Link
          to="/releases"
          className="t-faint"
          style={{ fontSize: 'var(--text-2xs)', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', color: 'var(--paper-dim)' }}
        >
          see all <Icon name="arrowR" size={11} />
        </Link>
      </div>
    </div>
  );
}
