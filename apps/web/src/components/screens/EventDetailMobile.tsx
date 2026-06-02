import { useParams } from 'react-router-dom';
import { useEventDetail } from '../../hooks/useEvents';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useNow } from '../../hooks/useNow';
import { MobileHeader } from '../layout/MobileHeader';
import { EventGameGrid } from './events/EventGameGrid';
import { Marker } from '../primitives/Marker';
import { Btn } from '../primitives/Btn';
import { Icon } from '../primitives/Icon';
import { countdownParts, daysUntil } from '../../lib/utils';
import type { EventDetailResponse, EventState } from '@hoard/types';

/**
 * EV-PR1 mobile detail view. Single-column compact layout; same state
 * branching as desktop but the hero collapses to one block. Game grid
 * uses 2-col per OQ-EV-9.
 */
export function EventDetailMobile() {
  const { slug } = useParams<{ slug: string }>();
  const { data, loading, error, refetch } = useEventDetail(slug);
  useDocumentTitle(data?.event.name ?? 'Event');

  function downloadIcs() {
    if (!slug) return;
    window.open(`/api/events/${encodeURIComponent(slug)}/ics`, '_blank');
  }

  if (loading && !data) {
    return (
      <>
        <MobileHeader title="Event" />
        <div className="app-mobile-content" style={{ padding: 16 }}><Marker>// loading…</Marker></div>
      </>
    );
  }
  if (error) {
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
        <DetailHero data={data} onAddToCalendar={downloadIcs} />
        {data.event.description && (
          <div className="t-sans" style={{ marginTop: 16, fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--paper-dim)' }}>
            {data.event.description}
          </div>
        )}

        <section style={{ marginTop: 24 }}>
          <Marker style={{ marginBottom: 8 }}>
            // games · {data.games.length}
            {data.personalisation.onWishlistCount > 0 && (
              <span style={{ color: 'var(--amber)' }}> · {data.personalisation.onWishlistCount} wished</span>
            )}
          </Marker>
          <EventGameGrid games={data.games} showSparseDisclaimer={data.event.state !== 'upcoming'} mobile />
        </section>
      </div>
    </>
  );
}

function DetailHero({ data, onAddToCalendar }: { data: EventDetailResponse; onAddToCalendar: () => void }) {
  const e = data.event;
  const state: EventState = e.state;
  const now = useNow(state === 'upcoming' ? 1000 : 0);
  const cd = countdownParts(e.startTime, now);
  const away = daysUntil(e.startTime, now);
  const network = e.networks[0]?.name ?? null;

  return (
    <header className="panel" style={{
      padding: 16,
      borderColor: state === 'live' ? 'var(--red-dim)' : state === 'upcoming' ? 'var(--amber-dim)' : 'var(--rule)',
    }}>
      {state === 'live' && <Marker style={{ color: 'var(--red)' }}>// live now</Marker>}
      {state === 'upcoming' && <Marker style={{ color: 'var(--amber)' }}>// {away} days away</Marker>}
      {state === 'past' && <Marker>// aired {Math.abs(away)} day{Math.abs(away) === 1 ? '' : 's'} ago</Marker>}

      <div style={{ marginTop: 8 }}>
        {network && (
          <div className="t-mono t-dim" style={{ fontSize: 'var(--text-xs)' }}>{network}</div>
        )}
      </div>

      {state === 'upcoming' && cd && (
        <div style={{ marginTop: 12, display: 'flex', gap: 4 }}>
          {([['d', cd.d], ['h', cd.h], ['m', cd.m], ['s', cd.s]] as [string, string][]).map(([k, v]) => (
            <div key={k} style={{
              background: 'var(--ink-2)', border: '1px solid var(--rule-bright)',
              padding: '6px 8px', textAlign: 'center', flex: 1,
            }}>
              <div className="t-mono t-tnum" style={{ fontSize: 'var(--text-md)', color: 'var(--amber)', lineHeight: 1 }}>{v}</div>
              <div className="t-faint t-up" style={{ fontSize: 'var(--text-3xs)', marginTop: 3 }}>{k.toUpperCase()}</div>
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
