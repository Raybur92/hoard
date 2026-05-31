import { useNavigate } from 'react-router-dom';
import type { Platform } from '@hoard/types';
import { Icon } from '../../primitives/Icon';

export interface AlertsStripProps {
  platforms: Platform[];
  /** DEALS-PR1 — count of active deals on the user's wishlist. 0 = no
   *  chip rendered. Click navigates to `/deals`. */
  wishlistDealsCount?: number;
}

const PLATFORM_LABELS: Record<string, string> = {
  ST: 'steam', PS: 'psn', XB: 'xbox', GG: 'gog', NT: 'nintendo', EP: 'epic', IT: 'itch.io',
};

/**
 * DASH-PR3 — Dashboard alerts strip; first entry into the bento's slim
 * top-strip surface per PAGES_PLAN §7.4 + OQ-DASH-11.
 *
 * Today this surfaces ONE chip type: any connected platform whose
 * `syncStatus === 'error'`. Aggregated into a single chip (per Andrea's
 * lock — `single aggregated chip`); click navigates to `/settings/platforms`
 * where the user can re-paste tokens / re-auth / see the per-platform log.
 *
 * Not dismissible — the chip disappears automatically when the underlying
 * error clears on the next successful sync. No risk of the user dismissing
 * and forgetting an unresolved problem.
 *
 * Component returns null when there's nothing to surface, so the bento grid
 * reflows naturally (the alerts slot is span-12 at the top — when absent,
 * row 1 starts immediately).
 *
 * Future workstreams (Q-series pending-review, EV-PR3 events-missed,
 * Deals callout) thread additional chips through this same component.
 */
export function AlertsStrip({ platforms, wishlistDealsCount = 0 }: AlertsStripProps) {
  const navigate = useNavigate();
  const errored = platforms.filter((p) => p.syncStatus === 'error');
  const hasErrors = errored.length > 0;
  const hasDeals = wishlistDealsCount > 0;
  if (!hasErrors && !hasDeals) return null;

  const codes = errored.map((p) => PLATFORM_LABELS[p.code] ?? p.code.toLowerCase());
  const errorLabel = codes.length === 1
    ? codes[0]
    : codes.length === 2
      ? `${codes[0]} · ${codes[1]}`
      : `${codes.length} platforms`;

  return (
    <div
      data-testid="alerts-strip"
      role="region"
      aria-label="Dashboard alerts"
      style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      {hasErrors && (
        <button
          type="button"
          onClick={() => navigate('/settings/platforms')}
          aria-label={`${errored.length} platform${errored.length === 1 ? '' : 's'} failed to sync — open Settings`}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 14px',
            background: 'var(--ink)',
            border: '1px solid var(--red-dim)',
            color: 'var(--paper)',
            font: 'inherit',
            fontSize: 'var(--text-xs)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <Icon name="warn" size={14} style={{ color: 'var(--red)', flexShrink: 0 }} />
          <span className="t-mono">
            <span style={{ color: 'var(--red)' }}>sync error</span>
            <span style={{ color: 'var(--paper-dim)' }}> · {errorLabel}</span>
          </span>
          <span style={{ flex: 1 }} />
          <span className="t-faint t-mono" style={{ fontSize: 'var(--text-3xs)' }}>
            view in settings →
          </span>
        </button>
      )}
      {hasDeals && (
        <button
          type="button"
          data-testid="alerts-strip-deals"
          onClick={() => navigate('/deals')}
          aria-label={`${wishlistDealsCount} wishlist game${wishlistDealsCount === 1 ? '' : 's'} on sale — open Deals`}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 14px',
            background: 'var(--ink)',
            border: '1px solid var(--amber-dim)',
            color: 'var(--paper)',
            font: 'inherit',
            fontSize: 'var(--text-xs)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <Icon name="tag" size={14} style={{ color: 'var(--amber)', flexShrink: 0 }} />
          <span className="t-mono">
            <span style={{ color: 'var(--amber)' }}>
              {wishlistDealsCount} wishlist game{wishlistDealsCount === 1 ? '' : 's'} on sale
            </span>
          </span>
          <span style={{ flex: 1 }} />
          <span className="t-faint t-mono" style={{ fontSize: 'var(--text-3xs)' }}>
            see deals →
          </span>
        </button>
      )}
    </div>
  );
}
