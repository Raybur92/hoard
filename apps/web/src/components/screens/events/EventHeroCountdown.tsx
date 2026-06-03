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

      {/* Asymmetric layout — title wins flex priority over the countdown so
          long event names don't get squeezed into vertical columns of text.
          Title scales down via clamp() for very long names; text-wrap:
          balance distributes line breaks evenly. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 28, marginTop: 16 }}>
        <div style={{ minWidth: 0, flex: '3 1 360px' }}>
          <div className="t-display" style={{
            fontSize: 'clamp(var(--text-lg), 3vw, var(--text-xl))',
            lineHeight: 1.05,
            color: 'var(--paper)',
            letterSpacing: '-0.01em',
            textWrap: 'balance',
            overflowWrap: 'break-word',
          }}>
            {event.name}
          </div>
          {network && (
            <div className="t-mono t-dim" style={{ fontSize: 'var(--text-xs)', marginTop: 10 }}>
              {network} · {dateLabel} · {timeLabel}
            </div>
          )}
        </div>

        {cd && (
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            {([['d', cd.d], ['h', cd.h], ['m', cd.m], ['s', cd.s]] as [string, string][]).map(([k, v]) => (
              <div key={k} style={{ textAlign: 'center' }}>
                <div className="t-mono t-tnum" style={{
                  fontSize: 'var(--text-2xl)', color: 'var(--amber)',
                  lineHeight: 0.9, letterSpacing: '-0.03em',
                }}>{v}</div>
                <div className="t-faint t-up" style={{
                  fontSize: 'var(--text-3xs)', marginTop: 4, letterSpacing: '0.15em',
                }}>{k.toUpperCase()}</div>
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
