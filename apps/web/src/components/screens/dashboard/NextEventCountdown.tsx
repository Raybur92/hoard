import { useNavigate } from 'react-router-dom';
import type { EventListRow } from '@hoard/types';
import { useNow } from '../../../hooks/useNow';
import { countdownParts } from '../../../lib/utils';

interface Props {
  event: EventListRow;
}

export function NextEventCountdown({ event }: Props) {
  const navigate = useNavigate();
  const now = useNow(1000);

  const isLive = event.state === 'live';
  const parts = countdownParts(event.startTime, now);

  const networkName =
    event.networks.length > 0 ? event.networks[0]?.name ?? null : null;

  const countdown: Array<{ label: string; value: string }> = parts
    ? [
        { label: 'd', value: parts.d },
        { label: 'h', value: parts.h },
        { label: 'm', value: parts.m },
        { label: 's', value: parts.s },
      ]
    : [];

  return (
    <div
      data-testid="card-next-event"
      data-bento-span={3}
      className="panel"
      style={{
        gridColumn: 'span 3',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        cursor: 'pointer',
        borderColor: isLive ? 'var(--red-dim)' : undefined,
      }}
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/events/${encodeURIComponent(event.slug)}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/events/${encodeURIComponent(event.slug)}`);
        }
      }}
      aria-label={`${event.name} — open event detail`}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {isLive && (
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'var(--red)',
              flexShrink: 0,
              animation: 'events-live-pulse 2s ease-in-out infinite',
            }}
          />
        )}
        <span
          className="t-mono t-faint t-up"
          style={{ fontSize: 'var(--text-2xs)', letterSpacing: '0.08em' }}
        >
          {isLive ? '// live now' : '// next event'}
        </span>
      </div>

      {/* Event name */}
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 'var(--text-sm)',
          color: 'var(--paper)',
          lineHeight: 'var(--lh-snug)',
          fontWeight: 600,
        }}
      >
        {event.name}
      </div>

      {/* Network label */}
      {networkName && (
        <div
          className="t-faint"
          style={{ fontFamily: 'var(--mono)', fontSize: 'var(--text-2xs)' }}
        >
          {networkName}
        </div>
      )}

      {/* Countdown / live indicator */}
      <div style={{ marginTop: 'auto', paddingTop: 8 }}>
        {isLive ? (
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 'var(--text-md)',
              color: 'var(--red)',
              fontWeight: 700,
              letterSpacing: '0.04em',
            }}
          >
            happening now
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            {countdown.map(({ label, value }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div
                  className="t-amber t-mono t-tnum"
                  style={{ fontSize: 'var(--text-xl)', fontWeight: 700, lineHeight: 1 }}
                >
                  {value}
                </div>
                <div
                  className="t-faint t-mono t-up"
                  style={{ fontSize: 'var(--text-3xs)', marginTop: 2 }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer link */}
      <div
        className="t-faint t-mono"
        style={{ fontSize: 'var(--text-2xs)', marginTop: 4 }}
      >
        {event.gameCount > 0
          ? `${event.gameCount} game${event.gameCount !== 1 ? 's' : ''} · see detail →`
          : 'see detail →'}
      </div>
    </div>
  );
}
