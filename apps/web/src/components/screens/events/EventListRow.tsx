import { Link } from 'react-router-dom';
import type { EventListRow as EventListRowData } from '@hoard/types';
import { daysUntil } from '../../../lib/utils';

export interface EventListRowProps {
  event: EventListRowData;
}

/**
 * EV-PR1 — single row in the desktop `/events` sections. Static `Xd` label
 * (not live-tick — keeps the list cheap to render). Click navigates to the
 * detail view via slug.
 */
export function EventListRow({ event }: EventListRowProps) {
  const startDate = new Date(event.startTime);
  const dateLabel = startDate.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const away = daysUntil(event.startTime);
  const isUpcoming = event.state === 'upcoming';
  const isLive = event.state === 'live';
  const network = event.networks[0]?.name ?? '—';

  return (
    <Link
      to={`/events/${event.slug}`}
      className="panel event-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '32px 1fr auto',
        gap: 16,
        padding: '12px 16px',
        alignItems: 'center',
        textDecoration: 'none',
        color: 'inherit',
        // Upcoming rows get a brighter border tone so they read as
        // "current" against past archive rows. Live still claims the
        // strongest treatment with --red-dim.
        borderColor: isLive ? 'var(--red-dim)' : isUpcoming ? 'var(--rule-bright)' : 'var(--rule)',
      }}
    >
      {event.logoUrl ? (
        <img
          src={event.logoUrl}
          alt=""
          width={24}
          height={24}
          loading="lazy"
          style={{
            width: 24,
            height: 24,
            objectFit: 'contain',
            display: 'block',
          }}
        />
      ) : (
        <div style={{
          width: 24, height: 24, display: 'grid', placeItems: 'center',
          background: 'var(--ink-2)', borderRadius: 2, fontSize: 'var(--text-2xs)',
          color: isLive ? 'var(--red)' : isUpcoming ? 'var(--amber)' : 'var(--paper-dim)',
        }}>▣</div>
      )}

      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--paper)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {event.name}
        </div>
        <div className="t-mono t-dim" style={{ fontSize: 'var(--text-2xs)', marginTop: 2 }}>
          {network} · {dateLabel}
          {event.gamesResolvedAt !== null && (
            <> · {event.gameCount} {event.gameCount === 1 ? 'game' : 'games'}</>
          )}
        </div>
      </div>

      <div
        className={isLive ? 't-mono t-tnum events-live-pulse' : 't-mono t-tnum'}
        style={{
          fontSize: 'var(--text-xs)',
          color: isLive ? 'var(--red)' : isUpcoming ? 'var(--amber)' : 'var(--paper-faint)',
          whiteSpace: 'nowrap',
        }}
      >
        {isLive ? '● live' : isUpcoming ? (away === 0 ? 'today' : `${away}d`) : `${Math.abs(away)}d ago`}
      </div>
    </Link>
  );
}
