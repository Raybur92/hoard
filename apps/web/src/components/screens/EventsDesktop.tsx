import { useEffect } from 'react';
import { useEvents } from '../../hooks/useEvents';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { EventHeroCountdown } from './events/EventHeroCountdown';
import { EventListRow } from './events/EventListRow';
import { Marker } from '../primitives/Marker';
import { Btn } from '../primitives/Btn';
import type { EventListRow as EventListRowData } from '@hoard/types';

/**
 * EV-PR1 — `/events` list view. Sections:
 *   - hero countdown (next-soonest upcoming, global)
 *   - upcoming + live
 *   - recent (≤30d ago)
 *   - past (archive, default 24-month depth)
 *
 * Filter chips + year-jump deferred to EV-PR2 per the workstream sequence.
 */
export function EventsDesktop() {
  useDocumentTitle('Events');
  const { data, loading, error, refetch } = useEvents();

  // EV-PR1 ships the `.ics` download via direct hit to the API; no SDK
  // route needed since the response is just text/calendar.
  function downloadIcs(slug: string) {
    window.open(`/api/events/${encodeURIComponent(slug)}/ics`, '_blank');
  }

  useEffect(() => { /* placeholder for any list-mount telemetry */ }, []);

  if (loading && !data) {
    return (
      <div className="app-content" style={{ padding: 24 }}>
        <Marker>// loading events…</Marker>
      </div>
    );
  }
  if (error) {
    return (
      <div className="app-content" style={{ padding: 24 }}>
        <Marker style={{ color: 'var(--red)' }}>// failed to load events · {error}</Marker>
        <div style={{ marginTop: 12 }}>
          <Btn onClick={refetch}>retry</Btn>
        </div>
      </div>
    );
  }
  if (!data) return null;

  const isEmpty = !data.hero && data.upcoming.length === 0 && data.recent.length === 0 && data.past.length === 0;

  return (
    <div className="app-content" style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <header style={{ marginBottom: 24 }}>
        <Marker>// events · {data.counts.upcoming} upcoming · {data.counts.past} past</Marker>
      </header>

      {isEmpty && (
        <div className="panel" style={{ padding: 32, textAlign: 'center' }}>
          <Marker>// no events yet</Marker>
          <div className="t-sans t-dim" style={{ fontSize: 'var(--text-sm)', marginTop: 8 }}>
            Sync runs nightly. If you're an admin you can trigger a refresh from the admin panel.
          </div>
        </div>
      )}

      {data.hero && (
        <section style={{ marginBottom: 32 }}>
          <EventHeroCountdown event={data.hero} onAddToCalendar={() => downloadIcs(data.hero!.slug)} />
        </section>
      )}

      <Section title="upcoming" rows={data.upcoming.filter((r) => r.slug !== data.hero?.slug)} />
      <Section title="recent · last 30 days" rows={data.recent} />
      <ArchiveSections rows={data.past} />
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: EventListRowData[] }) {
  if (rows.length === 0) return null;
  return (
    <section style={{ marginBottom: 32 }}>
      <Marker style={{ marginBottom: 12 }}>// {title}</Marker>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((e) => <EventListRow key={e.slug} event={e} />)}
      </div>
    </section>
  );
}

/**
 * Past events are grouped by start-year for legibility. EV-PR2 layers in the
 * year-jump nav; for EV-PR1 the simple grouping is already a win over a flat
 * list.
 */
function ArchiveSections({ rows }: { rows: EventListRowData[] }) {
  if (rows.length === 0) return null;
  const byYear = new Map<number, EventListRowData[]>();
  for (const e of rows) {
    const year = new Date(e.startTime).getUTCFullYear();
    const bucket = byYear.get(year);
    if (bucket) bucket.push(e);
    else byYear.set(year, [e]);
  }
  const sortedYears = [...byYear.keys()].sort((a, b) => b - a);
  return (
    <>
      {sortedYears.map((y) => (
        <Section key={y} title={`archive · ${y}`} rows={byYear.get(y) ?? []} />
      ))}
    </>
  );
}
