import { useParams, Link } from 'react-router-dom';
import { useEventDetail } from '../../hooks/useEvents';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useNow } from '../../hooks/useNow';
import { EventGameGrid } from './events/EventGameGrid';
import { Marker } from '../primitives/Marker';
import { Btn } from '../primitives/Btn';
import { Icon } from '../primitives/Icon';
import { countdownParts, daysUntil } from '../../lib/utils';
import type { EventDetailResponse, EventState } from '@hoard/types';

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
  const { data, loading, error, refetch } = useEventDetail(slug);
  useDocumentTitle(data?.event.name ?? 'Event');

  function downloadIcs() {
    if (!slug) return;
    window.open(`/api/events/${encodeURIComponent(slug)}/ics`, '_blank');
  }

  if (loading && !data) {
    return <div className="app-content" style={{ padding: 24 }}><Marker>// loading…</Marker></div>;
  }
  if (error) {
    return (
      <div className="app-content" style={{ padding: 24 }}>
        <Link to="/events" className="t-mono t-dim" style={{ fontSize: 'var(--text-xs)' }}>← back to events</Link>
        <Marker style={{ marginTop: 16, color: 'var(--red)' }}>
          // {error.includes('404') ? 'event not found' : 'failed to load'}
        </Marker>
        <div style={{ marginTop: 12 }}><Btn onClick={refetch}>retry</Btn></div>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="app-content" style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <Link to="/events" className="t-mono t-dim" style={{ fontSize: 'var(--text-xs)', textDecoration: 'none' }}>
        ← back to events
      </Link>
      <DetailHero data={data} onAddToCalendar={downloadIcs} />
      {data.event.description && (
        <div className="t-sans" style={{ marginTop: 24, fontSize: 'var(--text-sm)', lineHeight: 1.6, color: 'var(--paper-dim)', maxWidth: 720 }}>
          {data.event.description}
        </div>
      )}

      <section style={{ marginTop: 32 }}>
        <Marker style={{ marginBottom: 12 }}>
          // games{data.event.gamesResolvedAt !== null && ` · ${data.games.length}`}
          {data.personalisation.onWishlistCount > 0 && (
            <span style={{ color: 'var(--amber)' }}> · {data.personalisation.onWishlistCount} on your wishlist</span>
          )}
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
        <section style={{ marginTop: 32 }}>
          <Marker style={{ marginBottom: 12 }}>// videos</Marker>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.event.videos.map((v) => (
              <a
                key={v.youtubeId}
                href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.youtubeId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="t-mono"
                style={{
                  fontSize: 'var(--text-sm)', color: 'var(--paper)',
                  textDecoration: 'none', padding: '6px 12px',
                  border: '1px solid var(--rule)', background: 'var(--ink-2)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <Icon name="play" size={12} /> {v.name ?? 'watch on youtube'} <Icon name="ext" size={11} />
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function DetailHero({ data, onAddToCalendar }: { data: EventDetailResponse; onAddToCalendar: () => void }) {
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
  const network = e.networks[0]?.name ?? null;

  return (
    <header className="panel" style={{
      marginTop: 16, padding: 24,
      borderColor: state === 'live' ? 'var(--red-dim)' : state === 'upcoming' ? 'var(--amber-dim)' : 'var(--rule)',
    }}>
      {state === 'live' && (
        <Marker style={{ color: 'var(--red)' }}>// live now</Marker>
      )}
      {state === 'upcoming' && (
        <Marker style={{ color: 'var(--amber)' }}>// next showcase · {away} days away</Marker>
      )}
      {state === 'past' && (
        <Marker>// aired {Math.abs(away)} day{Math.abs(away) === 1 ? '' : 's'} ago</Marker>
      )}

      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)', lineHeight: 1.1, color: 'var(--paper)', letterSpacing: '-0.02em' }}>
            {e.name}
          </h1>
          {network && (
            <div className="t-mono t-dim" style={{ fontSize: 'var(--text-sm)', marginTop: 8 }}>
              {network} · {dateLabel} · {timeLabel}
            </div>
          )}
        </div>

        {state === 'upcoming' && cd && (
          <div style={{ flex: '0 0 auto', display: 'flex', gap: 6 }}>
            {([['d', cd.d], ['h', cd.h], ['m', cd.m], ['s', cd.s]] as [string, string][]).map(([k, v]) => (
              <div key={k} style={{
                background: 'var(--ink-2)', border: '1px solid var(--rule-bright)',
                padding: '10px 12px', textAlign: 'center', minWidth: 50,
              }}>
                <div className="t-mono t-tnum" style={{ fontSize: 'var(--text-lg)', color: 'var(--amber)', lineHeight: 1 }}>{v}</div>
                <div className="t-faint t-up" style={{ fontSize: 'var(--text-3xs)', marginTop: 4 }}>{k.toUpperCase()}</div>
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
