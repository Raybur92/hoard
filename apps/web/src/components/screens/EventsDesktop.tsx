import { useEffect } from 'react';
import { useEvents } from '../../hooks/useEvents';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { TopBar } from '../layout/TopBar';
import { EventHeroCountdown } from './events/EventHeroCountdown';
import { EventListRow } from './events/EventListRow';
import { Marker } from '../primitives/Marker';
import { Btn } from '../primitives/Btn';
import { Icon } from '../primitives/Icon';
import type { EventListRow as EventListRowData } from '@hoard/types';
import { api } from '../../lib/api';

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

  function downloadIcs(slug: string) {
    void api.downloadEventIcs(slug);
  }

  useEffect(() => { /* placeholder for any list-mount telemetry */ }, []);

  if (!data && loading) {
    return (
      <>
        <TopBar crumbs={['hoard', 'events']} />
        <div style={{ padding: '24px 32px' }}>
          <Marker>// loading events…</Marker>
        </div>
      </>
    );
  }
  if (!data && error) {
    return (
      <>
        <TopBar crumbs={['hoard', 'events']} />
        <div style={{ padding: '24px 32px' }}>
          <Marker style={{ color: 'var(--red)' }}>// failed to load events · {error}</Marker>
          <div style={{ marginTop: 12 }}>
            <Btn onClick={refetch}>retry</Btn>
          </div>
        </div>
      </>
    );
  }
  if (!data) return null;

  const isEmpty = !data.hero && data.upcoming.length === 0 && data.recent.length === 0 && data.past.length === 0;

  return (
    <>
      <TopBar crumbs={['hoard', 'events']} />
      {/* Sub-header band — same shape as DealsDesktop / ReleasesDesktop:
          page label on the left, status + actions on the right. */}
      <div style={{
        padding: '16px 32px 14px',
        borderBottom: '1px solid var(--rule)',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <span className="t-up" style={{ fontSize: 'var(--text-2xs)' }}>events</span>
        <span className="t-mono t-faint" style={{ fontSize: 'var(--text-2xs)' }}>
          · {data.counts.upcoming} upcoming · {data.counts.past} past
        </span>
        <span style={{ flex: 1 }} />
        <Btn sm onClick={refetch}>
          <Icon name="refresh" size={10} /> refresh
        </Btn>
      </div>

      <div
        className="thin-scroll"
        style={{
          flex: 1, overflow: 'auto', padding: '24px 32px 40px',
          display: 'flex', flexDirection: 'column', gap: 32,
        }}
      >
        {isEmpty && (
          <div className="panel" style={{ padding: 32, textAlign: 'center' }}>
            <Marker>// no events yet</Marker>
            <div className="t-sans t-dim" style={{ fontSize: 'var(--text-sm)', marginTop: 8 }}>
              Sync runs nightly. If you're an admin you can trigger a refresh from the admin panel.
            </div>
          </div>
        )}

        {data.hero && (
          <section>
            <EventHeroCountdown event={data.hero} onAddToCalendar={() => downloadIcs(data.hero!.slug)} />
          </section>
        )}

        <Section title="upcoming" rows={data.upcoming.filter((r) => r.slug !== data.hero?.slug)} />
        <Section title="recent · last 30 days" rows={data.recent} />
        <ArchiveSections rows={data.past} />
      </div>
    </>
  );
}

function Section({ title, rows }: { title: string; rows: EventListRowData[] }) {
  if (rows.length === 0) return null;
  return (
    <section>
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
