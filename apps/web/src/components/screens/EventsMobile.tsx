import { useEvents } from '../../hooks/useEvents';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { EventHeroCountdown } from './events/EventHeroCountdown';
import { EventListRow } from './events/EventListRow';
import { MobileHeader } from '../layout/MobileHeader';
import { Marker } from '../primitives/Marker';
import { Btn } from '../primitives/Btn';
import { Icon } from '../primitives/Icon';
import type { EventListRow as EventListRowData } from '@hoard/types';
import { api } from '../../lib/api';

/**
 * EV-PR1 mobile — same composition as desktop, single-column.
 *
 * Full mobile polish pass (sticky filter bar, swipe gestures) lives in
 * EV-PR4. For EV-PR1 this is structurally the desktop layout in a narrower
 * container.
 */
export function EventsMobile() {
  useDocumentTitle('Events');
  const { data, loading, error, refetch } = useEvents();

  function downloadIcs(slug: string) {
    void api.downloadEventIcs(slug);
  }

  if (!data && loading) {
    return (
      <>
        <MobileHeader title="events" />
        <div className="app-mobile-content" style={{ padding: 16 }}>
          <Marker>// loading events…</Marker>
        </div>
      </>
    );
  }
  if (!data && error) {
    return (
      <>
        <MobileHeader title="events" />
        <div className="app-mobile-content" style={{ padding: 16 }}>
          <Marker style={{ color: 'var(--red)' }}>// failed to load · {error}</Marker>
          <div style={{ marginTop: 12 }}><Btn onClick={refetch}>retry</Btn></div>
        </div>
      </>
    );
  }
  if (!data) return null;

  return (
    <>
      <MobileHeader
        title="events"
        sub={`// ${data.counts.upcoming} upcoming · ${data.counts.past} past`}
        right={
          <Btn sm ariaLabel="Refresh events" onClick={() => refetch()}>
            <Icon name="refresh" size={10} />
          </Btn>
        }
      />
      <div className="app-mobile-content" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 24 }}>
        {data.hero && (
          <section>
            <EventHeroCountdown event={data.hero} onAddToCalendar={() => downloadIcs(data.hero!.slug)} />
          </section>
        )}

        <MobileSection title="upcoming" rows={data.upcoming.filter((r) => r.slug !== data.hero?.slug)} />
        <MobileSection title="recent" rows={data.recent} />
        <MobileSection title="past" rows={data.past} />
      </div>
    </>
  );
}

function MobileSection({ title, rows }: { title: string; rows: EventListRowData[] }) {
  if (rows.length === 0) return null;
  return (
    <section style={{ marginBottom: 20 }}>
      <Marker style={{ marginBottom: 8 }}>// {title}</Marker>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((e) => <EventListRow key={e.slug} event={e} />)}
      </div>
    </section>
  );
}
