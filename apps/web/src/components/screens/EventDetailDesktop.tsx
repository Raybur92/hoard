import { useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEventDetail } from '../../hooks/useEvents';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useNow } from '../../hooks/useNow';
import { TopBar } from '../layout/TopBar';
import { EventGameGrid } from './events/EventGameGrid';
import { EventVideoGrid } from './events/EventVideoGrid';
import { Marker } from '../primitives/Marker';
import { Btn } from '../primitives/Btn';
import { Icon } from '../primitives/Icon';
import { countdownParts, daysUntil } from '../../lib/utils';
import type { EventDetailResponse, EventState } from '@hoard/types';
import { api } from '../../lib/api';

/** Truncate long event names for the breadcrumb tail. Matches the pattern
 *  GameDetailV2Desktop uses (single-line, ellipsis at ~40 chars). */
function crumbName(name: string): string {
  const max = 40;
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

/**
 * EV-PR1 — `/events/:slug` detail view.
 *
 * State branches per EV-D12 (upcoming / live / past). All three render the
 * same Hero + actions + game grid + description shape, but the hero changes:
 *   - upcoming → giant d/h/m/s countdown dominant
 *   - live     → `// LIVE NOW` red banner, no countdown
 *   - past     → static "// aired N days ago" caption
 *
 * Live-stream EMBED is deferred to EV-PR3 (CSP carve-out lands then per
 * EV-D2). EV-PR1 only renders the deep-link out.
 */
export function EventDetailDesktop() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: fresh, loading, error, refetch } = useEventDetail(slug);
  // DASH-PR2 stale-while-revalidate pattern: keep the last successful
  // response on screen during refetches so cache invalidations don't
  // flash the page to a loading skeleton + unmount the game grid
  // (which makes [check again] look like a "page reload").
  const lastGoodRef = useRef<EventDetailResponse | null>(null);
  if (fresh) lastGoodRef.current = fresh;
  const data = fresh ?? lastGoodRef.current;
  useDocumentTitle(data?.event.name ?? 'Event');

  function downloadIcs() {
    if (!slug) return;
    void api.downloadEventIcs(slug);
  }

  if (!data && loading) {
    return (
      <>
        <TopBar crumbs={['hoard', 'events', '…']} />
        <div style={{ padding: '24px 32px' }}><Marker>// loading…</Marker></div>
      </>
    );
  }
  if (!data && error) {
    return (
      <>
        <TopBar crumbs={['hoard', 'events', '…']} />
        <div style={{ padding: '24px 32px' }}>
          <Marker style={{ color: 'var(--red)' }}>
            // {error.includes('404') ? 'event not found' : 'failed to load'}
          </Marker>
          <div style={{ marginTop: 12 }}><Btn onClick={refetch}>retry</Btn></div>
        </div>
      </>
    );
  }
  if (!data) return null;

  return (
    <>
      <TopBar crumbs={['hoard', 'events', crumbName(data.event.name)]} />

      {/* Explicit back affordance — same band as GameDetailDesktop /
          S1-S4 detail screens (12px 36px, borderBottom, navigate(-1)).
          Not extracted to a shared primitive yet; copies live inline
          in 4 other detail screens so this is the established shape. */}
      <div style={{ padding: '12px 36px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Btn sm onClick={() => navigate(-1)}>
          <Icon name="back" size={10} /> back
        </Btn>
      </div>

      <div
        className="thin-scroll"
        style={{
          flex: 1, overflow: 'auto', padding: '24px 32px 40px',
          display: 'flex', flexDirection: 'column', gap: 32,
        }}
      >
        <DetailHero
          data={data}
          onAddToCalendar={downloadIcs}
          wishlistedCount={data.personalisation.onWishlistCount}
        />

        <section>
          <Marker style={{ marginBottom: 12 }}>
            // games{data.event.gamesResolvedAt !== null && ` · ${data.games.length}`}
          </Marker>
          <EventGameGrid
            games={data.games}
            eventSlug={data.event.slug}
            gamesResolvedAt={data.event.gamesResolvedAt}
            showSparseDisclaimer={data.event.state !== 'upcoming'}
            onResolved={refetch}
          />
        </section>

        {data.event.videos.length > 0 && (
          <section>
            <Marker style={{ marginBottom: 12 }}>// trailers · {data.event.videos.length}</Marker>
            <EventVideoGrid videos={data.event.videos} />
          </section>
        )}

        {data.event.description && (
          <section>
            <Marker style={{ marginBottom: 12, color: 'var(--paper-faint)' }}>// about</Marker>
            <div className="t-sans" style={{ fontSize: 'var(--text-sm)', lineHeight: 1.6, color: 'var(--paper-dim)', maxWidth: 720 }}>
              {data.event.description}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function DetailHero({
  data, onAddToCalendar, wishlistedCount,
}: {
  data: EventDetailResponse;
  onAddToCalendar: () => void;
  wishlistedCount: number;
}) {
  const e = data.event;
  const state: EventState = e.state;
  const now = useNow(state === 'upcoming' ? 1000 : 0);
  const cd = countdownParts(e.startTime, now);
  const away = daysUntil(e.startTime, now);
  const startDate = new Date(e.startTime);
  const dateLabel = startDate.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const timeLabel = startDate.toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
  const compactDateLabel = startDate.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const network = e.networks[0]?.name ?? null;

  // Past-state compact hero — the focal point of a past-event page is the
  // games grid, not the metadata. Render header in a single inline row
  // (name + meta + watch-recap action), eating ~80px instead of ~250px.
  if (state === 'past') {
    return (
      <header className="panel" style={{
        padding: 18,
        borderColor: 'var(--rule)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
        }}>
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <h1 className="t-display" style={{
              margin: 0,
              fontSize: 'clamp(var(--text-lg), 2.5vw, var(--text-xl))',
              lineHeight: 1.1,
              color: 'var(--paper)',
              letterSpacing: '-0.01em',
              textWrap: 'balance',
              overflowWrap: 'break-word',
            }}>
              {e.name}
            </h1>
            <div className="t-mono t-dim" style={{ fontSize: 'var(--text-xs)', marginTop: 8 }}>
              <span style={{ color: 'var(--paper-dim)' }}>
                aired {Math.abs(away)} day{Math.abs(away) === 1 ? '' : 's'} ago
              </span>
              {network && ` · ${network}`}
              {` · ${compactDateLabel}`}
              {wishlistedCount > 0 && (
                <span style={{ color: 'var(--amber)' }}>
                  {' · '}★ {wishlistedCount} on your wishlist
                </span>
              )}
            </div>
          </div>
          {e.liveStreamUrl && (
            <a
              href={e.liveStreamUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn sm"
              style={{ textDecoration: 'none', flex: '0 0 auto' }}
            >
              <Icon name="ext" size={11} /> watch recap
            </a>
          )}
        </div>
      </header>
    );
  }

  return (
    <header className="panel" style={{
      padding: 24,
      borderColor: state === 'live' ? 'var(--red-dim)' : 'var(--amber-dim)',
    }}>
      {/* Top row: state marker (left) + wishlist chip (right) on the same
          baseline so the chip looks anchored to content, not floating. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        {state === 'live' && (
          <Marker className="events-live-pulse" style={{ color: 'var(--red)' }}>● live now</Marker>
        )}
        {state === 'upcoming' && (
          <Marker style={{ color: 'var(--amber)' }}>// next showcase · {away} days away</Marker>
        )}
        {wishlistedCount > 0 && (
          <span className="marker" style={{ color: 'var(--amber)' }}>
            ★ {wishlistedCount} on your wishlist
          </span>
        )}
      </div>

      {/* Title gets flex priority so long event names don't crush into a
          vertical text column; title scales down via clamp() and uses
          text-wrap: balance for clean line breaks. */}
      <div style={{ marginTop: 18, display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'flex-end' }}>
        <div style={{ flex: '3 1 380px', minWidth: 0 }}>
          <h1 className="t-display" style={{
            margin: 0,
            fontSize: 'clamp(var(--text-xl), 4vw, var(--text-2xl))',
            lineHeight: 1.05,
            color: 'var(--paper)',
            letterSpacing: '-0.02em',
            textWrap: 'balance',
            overflowWrap: 'break-word',
          }}>
            {e.name}
          </h1>
          {network && (
            <div className="t-mono t-dim" style={{ fontSize: 'var(--text-sm)', marginTop: 14 }}>
              {network} · {dateLabel} · {timeLabel}
            </div>
          )}
        </div>

        {state === 'upcoming' && cd && (
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'flex-end', gap: 12 }}>
            {([['d', cd.d], ['h', cd.h], ['m', cd.m], ['s', cd.s]] as [string, string][]).map(([k, v]) => (
              <div key={k} style={{ textAlign: 'center' }}>
                <div className="t-mono t-tnum" style={{
                  fontSize: 'var(--text-display-sm)', color: 'var(--amber)',
                  lineHeight: 0.88, letterSpacing: '-0.04em',
                }}>{v}</div>
                <div className="t-faint t-up" style={{
                  fontSize: 'var(--text-3xs)', marginTop: 5, letterSpacing: '0.18em',
                }}>{k.toUpperCase()}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {state === 'upcoming' && (
          <Btn variant="amber" sm onClick={onAddToCalendar}>
            <Icon name="download" size={11} /> + add to calendar
          </Btn>
        )}
        {e.liveStreamUrl && (
          <a
            href={e.liveStreamUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn sm"
            style={{ textDecoration: 'none' }}
          >
            <Icon name="ext" size={11} /> {state === 'live' ? 'watch live stream' : state === 'upcoming' ? 'watch stream' : 'watch on stream'}
          </a>
        )}
      </div>
    </header>
  );
}
