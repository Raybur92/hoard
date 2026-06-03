import { useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useEventDetail } from '../../hooks/useEvents';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useNow } from '../../hooks/useNow';
import { MobileHeader } from '../layout/MobileHeader';
import { EventGameGrid } from './events/EventGameGrid';
import { EventVideoGrid } from './events/EventVideoGrid';
import { Marker } from '../primitives/Marker';
import { Btn } from '../primitives/Btn';
import { Icon } from '../primitives/Icon';
import { countdownParts, daysUntil } from '../../lib/utils';
import type { EventDetailResponse, EventState } from '@hoard/types';
import { api } from '../../lib/api';

/**
 * EV-PR1 mobile detail view. Single-column compact layout; same state
 * branching as desktop but the hero collapses to one block. Game grid
 * uses 2-col per OQ-EV-9.
 */
export function EventDetailMobile() {
  const { slug } = useParams<{ slug: string }>();
  const { data: fresh, loading, error, refetch } = useEventDetail(slug);
  // DASH-PR2 stale-while-revalidate: keep last successful response on
  // screen during refetches so the [check again] click doesn't flash
  // the page to loading + unmount the grid (perceived as a reload).
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
        <MobileHeader title="Event" />
        <div className="app-mobile-content" style={{ padding: 16 }}><Marker>// loading…</Marker></div>
      </>
    );
  }
  if (!data && error) {
    return (
      <>
        <MobileHeader title="Event" />
        <div className="app-mobile-content" style={{ padding: 16 }}>
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
      <MobileHeader title={data.event.name} />
      <div className="app-mobile-content" style={{ padding: 16 }}>
        <DetailHero
          data={data}
          onAddToCalendar={downloadIcs}
          wishlistedCount={data.personalisation.onWishlistCount}
        />

        <section style={{ marginTop: 24 }}>
          <Marker style={{ marginBottom: 8 }}>
            // games{data.event.gamesResolvedAt !== null && ` · ${data.games.length}`}
          </Marker>
          <EventGameGrid
            games={data.games}
            eventSlug={data.event.slug}
            gamesResolvedAt={data.event.gamesResolvedAt}
            showSparseDisclaimer={data.event.state !== 'upcoming'}
            onResolved={refetch}
            mobile
          />
        </section>

        {data.event.videos.length > 0 && (
          <section style={{ marginTop: 24 }}>
            <Marker style={{ marginBottom: 8 }}>// trailers · {data.event.videos.length}</Marker>
            <EventVideoGrid videos={data.event.videos} mobile />
          </section>
        )}

        {data.event.description && (
          <section style={{ marginTop: 24 }}>
            <Marker style={{ marginBottom: 8, color: 'var(--paper-faint)' }}>// about</Marker>
            <div className="t-sans" style={{ fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--paper-dim)' }}>
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
  const network = e.networks[0]?.name ?? null;
  const compactDateLabel = new Date(e.startTime).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  // Past-state compact hero — see EventDetailDesktop for the rationale.
  // Mobile single-column variant: name + meta + optional [watch recap →].
  if (state === 'past') {
    return (
      <header className="panel" style={{
        padding: 14,
        borderColor: 'var(--rule)',
      }}>
        <h1 className="t-display" style={{
          margin: 0,
          fontSize: 'var(--text-lg)',
          lineHeight: 1.15,
          color: 'var(--paper)',
          letterSpacing: '-0.01em',
          textWrap: 'balance',
          overflowWrap: 'break-word',
        }}>
          {e.name}
        </h1>
        <div className="t-mono t-dim" style={{ fontSize: 'var(--text-2xs)', marginTop: 6 }}>
          <span style={{ color: 'var(--paper-dim)' }}>
            aired {Math.abs(away)}d ago
          </span>
          {network && ` · ${network}`}
          {` · ${compactDateLabel}`}
          {wishlistedCount > 0 && (
            <span style={{ color: 'var(--amber)' }}>
              {' · '}★ {wishlistedCount} wished
            </span>
          )}
        </div>
        {e.liveStreamUrl && (
          <div style={{ marginTop: 12 }}>
            <a
              href={e.liveStreamUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn sm"
              style={{ textDecoration: 'none' }}
            >
              <Icon name="ext" size={11} /> watch recap
            </a>
          </div>
        )}
      </header>
    );
  }

  return (
    <header className="panel" style={{
      padding: 16,
      borderColor: state === 'live' ? 'var(--red-dim)' : 'var(--amber-dim)',
    }}>
      {/* Top row: state marker (left) + wishlist chip (right) — anchored
          to the same baseline so the chip reads as content, not floating. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        {state === 'live' && <Marker className="events-live-pulse" style={{ color: 'var(--red)' }}>● live now</Marker>}
        {state === 'upcoming' && <Marker style={{ color: 'var(--amber)' }}>// {away} days away</Marker>}
        {wishlistedCount > 0 && (
          <span className="marker" style={{ color: 'var(--amber)' }}>
            ★ {wishlistedCount} wished
          </span>
        )}
      </div>

      <div style={{ marginTop: 8 }}>
        {network && (
          <div className="t-mono t-dim" style={{ fontSize: 'var(--text-xs)' }}>{network}</div>
        )}
      </div>

      {state === 'upcoming' && cd && (
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-end', gap: 8, justifyContent: 'space-between' }}>
          {([['d', cd.d], ['h', cd.h], ['m', cd.m], ['s', cd.s]] as [string, string][]).map(([k, v]) => (
            <div key={k} style={{ textAlign: 'center', flex: 1 }}>
              <div className="t-mono t-tnum" style={{
                fontSize: 'var(--text-xl)', color: 'var(--amber)',
                lineHeight: 0.9, letterSpacing: '-0.03em',
              }}>{v}</div>
              <div className="t-faint t-up" style={{
                fontSize: 'var(--text-3xs)', marginTop: 3, letterSpacing: '0.15em',
              }}>{k.toUpperCase()}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {state === 'upcoming' && (
          <Btn variant="amber" sm onClick={onAddToCalendar}>
            <Icon name="download" size={11} /> + calendar
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
            <Icon name="ext" size={11} /> stream
          </a>
        )}
      </div>
    </header>
  );
}
