import type { EventListRow } from '@hoard/types';
import { useNow } from '../../../hooks/useNow';
import { Btn } from '../../primitives/Btn';
import { Icon } from '../../primitives/Icon';
import { Marker } from '../../primitives/Marker';
import { countdownParts, daysUntil } from '../../../lib/utils';

export interface EventHeroCountdownProps {
  event: EventListRow;
  onAddToCalendar: () => void;
}

/**
 * EV-PR1 — hero card on `/events`. Mirrors the Releases `HeroCountdown` shape
 * per EV-D18 but is event-specific: shows network + giant d/h/m/s countdown +
 * `[+ add to calendar]` action. Pulled out as its own component instead of
 * lifting the Releases primitive (the surrounding chrome differs enough).
 *
 * Live 1Hz tick paused when document is hidden (useNow's contract).
 */
export function EventHeroCountdown({ event, onAddToCalendar }: EventHeroCountdownProps) {
  const now = useNow(1000);
  const cd = countdownParts(event.startTime, now);
  const away = daysUntil(event.startTime, now);
  const startDate = new Date(event.startTime);
  const dateLabel = startDate.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
  const timeLabel = startDate.toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
  const network = event.networks[0]?.name ?? null;

  return (
    <div className="panel" style={{
      padding: 24, borderColor: 'var(--amber-dim)',
    }}>
      <Marker style={{ color: 'var(--amber)' }}>
        // next showcase{away > 0 ? ` · ${away} days away` : ' · airing soon'}
      </Marker>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 24, marginTop: 12 }}>
        <div style={{ minWidth: 0, flex: '1 1 0' }}>
          <div style={{ fontSize: 'var(--text-xl)', lineHeight: 1.1, color: 'var(--paper)', letterSpacing: '-0.01em' }}>
            {event.name}
          </div>
          {network && (
            <div className="t-mono t-dim" style={{ fontSize: 'var(--text-xs)', marginTop: 6 }}>
              {network} · {dateLabel} · {timeLabel}
            </div>
          )}
        </div>

        {cd && (
          <div style={{ flex: '0 0 auto', display: 'flex', gap: 4 }}>
            {([['d', cd.d], ['h', cd.h], ['m', cd.m], ['s', cd.s]] as [string, string][]).map(([k, v]) => (
              <div key={k} style={{
                background: 'var(--ink-2)', border: '1px solid var(--rule-bright)',
                padding: '6px 8px', textAlign: 'center', minWidth: 38,
              }}>
                <div className="t-mono t-tnum" style={{ fontSize: 'var(--text-md)', color: 'var(--amber)', lineHeight: 1 }}>{v}</div>
                <div className="t-faint t-up" style={{ fontSize: 'var(--text-3xs)', marginTop: 3 }}>{k.toUpperCase()}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn variant="amber" sm onClick={onAddToCalendar} ariaLabel={`Add ${event.name} to calendar`}>
          <Icon name="download" size={11} /> + add to calendar
        </Btn>
        {event.liveStreamUrl && (
          <a
            href={event.liveStreamUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn sm"
            style={{ textDecoration: 'none' }}
          >
            <Icon name="ext" size={11} /> watch on stream
          </a>
        )}
      </div>
    </div>
  );
}
