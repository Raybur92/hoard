import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { TopBar } from '../layout/TopBar';
import { Marker } from '../primitives/Marker';
import { Btn } from '../primitives/Btn';
import { Icon } from '../primitives/Icon';
import { useQuery } from '../../hooks/useQuery';
import { api } from '../../lib/api';
import type { IgdbUpcomingRelease, RecentReleasesResponse } from '@hoard/types';
import { ReleaseCard } from './releases/ReleaseCard';

/* ────────────────────────────────────────────────────────────────────────
 * RECENT page (R4 of RELEASES_PLAN.md, handoff §10).
 *
 * Reached only via [view recent →] on the conditional banner. No other
 * entry points. No time-axis chrome (no mode switch, no scope toggle, no
 * time strip, no zoom toggle, no banner, no hero).
 *
 * Layout (handoff §10 desktop):
 *   1. TopBar with breadcrumb hoard / releases / recent.
 *   2. Page header: [← back to releases] + RECENT title + // last 14 days.
 *   3. Green prompt strip — informational only, no action button.
 *      Copy: "they'll move to your library automatically once your
 *      platforms sync."
 *   4. // just out · starred         → 2-col grid from data.starred
 *   5. // also released · not on your wishlist → 2-col grid from data.hyped
 *
 * Removed by handoff §10: the [mark all owned] button. Library sync is the
 * source of truth for ownership; manual ownership marking is intentionally
 * absent. Do NOT add it back even if a mock or earlier rev shows it.
 * ──────────────────────────────────────────────────────────────────────── */

export function ReleasesRecentDesktop() {
  useDocumentTitle('Recent · Releases');
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useQuery<RecentReleasesResponse>(
    'releases:recent',
    () => api.releasesRecent(),
  );

  const starred = data?.starred ?? [];
  const hyped = data?.hyped ?? [];
  const isEmpty = !loading && !error && data && starred.length === 0 && hyped.length === 0;

  return (
    <>
      <TopBar crumbs={['hoard', 'releases', 'recent']} />

      <RecentHeader onBack={() => navigate('/releases')} />

      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '20px 32px 32px' }}>
        {loading && !data && <Marker>// loading…</Marker>}

        {!loading && error && (
          <>
            <Marker>// couldn&rsquo;t load recent releases</Marker>
            <p style={{ marginTop: 14, color: 'var(--paper-dim)', fontSize: 'var(--text-sm)' }}>
              {String(error)}
            </p>
            <div style={{ marginTop: 14 }}>
              <Btn variant="primary" onClick={() => void refetch()}>retry</Btn>
            </div>
          </>
        )}

        {isEmpty && <RecentEmpty onBack={() => navigate('/releases')} />}

        {!loading && !error && data && !isEmpty && (
          <>
            <RecentPromptStrip />

            {starred.length > 0 && (
              <RecentSection
                marker={`// just out · starred · ${starred.length}`}
                items={starred}
                variant="recent"
                onItemOpen={(userGameId) => navigate(`/game/${userGameId}`)}
              />
            )}

            {hyped.length > 0 && (
              <RecentSection
                marker={`// also released · not on your wishlist · ${hyped.length}`}
                items={hyped}
                variant="recent"
                onItemOpen={(userGameId) => navigate(`/game/${userGameId}`)}
                topGap={starred.length > 0 ? 28 : 0}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Sub-components
 * ──────────────────────────────────────────────────────────────────────── */

function RecentHeader({ onBack }: { onBack: () => void }) {
  return (
    <div
      style={{
        padding: '24px 32px 18px',
        borderBottom: '1px solid var(--rule)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <Btn sm onClick={onBack}>
        <Icon name="back" size={11} /> back to releases
      </Btn>
      <span className="t-mono t-faint" style={{ fontSize: 'var(--text-2xs)' }}>/</span>
      <h1
        className="t-display"
        style={{
          fontSize: 'var(--text-xl)',
          color: 'var(--paper)',
          lineHeight: 1,
          letterSpacing: '-0.01em',
          margin: 0,
        }}
      >
        RECENT
      </h1>
      <span className="t-mono t-faint" style={{ fontSize: 'var(--text-2xs)', marginLeft: 2 }}>
        // last 14 days
      </span>
    </div>
  );
}

/**
 * Informational green strip — same green-prominent styling as the banner
 * but with no action button. Handoff §10:
 *   "Green prompt strip at the top of the content area, styled like the
 *    green banner but with no action button — informational only."
 */
function RecentPromptStrip() {
  return (
    <div
      role="note"
      style={{
        padding: '12px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        border: '1px solid var(--green-dim)',
        background: 'rgba(95,194,106,0.04)',
      }}
    >
      <Icon name="check" size={16} style={{ color: 'var(--green)' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="t-up"
          style={{ fontSize: 'var(--text-3xs)', letterSpacing: '0.12em', color: 'var(--green)' }}
        >
          // recent drops
        </div>
        <div className="t-faint" style={{ fontSize: 'var(--text-2xs)', marginTop: 3 }}>
          they&rsquo;ll move to your library automatically once your platforms sync.
        </div>
      </div>
    </div>
  );
}

function RecentSection({
  marker,
  items,
  variant,
  onItemOpen,
  topGap = 24,
}: {
  marker: string;
  items: IgdbUpcomingRelease[];
  variant: 'recent';
  onItemOpen: (userGameId: string) => void;
  topGap?: number;
}) {
  return (
    <section style={{ marginTop: topGap || 24 }}>
      <Marker>{marker}</Marker>
      <div
        style={{
          marginTop: 14,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 14,
        }}
      >
        {items.map((r) => (
          <ReleaseCard
            key={r.igdbId}
            release={r}
            variant={variant}
            onOpen={onItemOpen}
          />
        ))}
      </div>
    </section>
  );
}

function RecentEmpty({ onBack }: { onBack: () => void }) {
  return (
    <>
      <Marker>// nothing in the last 14 days</Marker>
      <p style={{ marginTop: 14, color: 'var(--paper-dim)', fontSize: 'var(--text-sm)' }}>
        no starred or high-hype releases dropped recently.
      </p>
      <div style={{ marginTop: 14 }}>
        <Btn variant="primary" onClick={onBack}>
          back to releases
        </Btn>
      </div>
    </>
  );
}
