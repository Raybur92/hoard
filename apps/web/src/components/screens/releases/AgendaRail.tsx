import type { IgdbUpcomingRelease } from '@hoard/types';
import { Cover } from '../../primitives/Cover';
import { Marker } from '../../primitives/Marker';
import { Icon } from '../../primitives/Icon';
import { daysUntil } from '../../../lib/utils';
import { releaseDateColumn } from './utils';

export type AgendaRailMode = 'wishlist' | 'all';

export interface AgendaRailProps {
  items: IgdbUpcomingRelease[];
  mode: AgendaRailMode;
  onItemClick?: (igdbId: number) => void;
}

/**
 * Right-side chronological flat list shown only on Releases · All · Months
 * (per handoff §6 truth table). Renders nothing for the empty case — caller
 * is responsible for the conditional placement (omit the rail entirely
 * rather than rendering an empty one).
 *
 * Each row is a tappable button if `onItemClick` is provided, plain div
 * otherwise. The row layout (52px / 32px / 1fr / auto) matches the rev07
 * mock at line 2515.
 */
export function AgendaRail({ items, mode, onItemClick }: AgendaRailProps) {
  return (
    <aside className="thin-scroll" style={{ overflow: 'auto', height: '100%', borderLeft: '1px solid var(--rule)' }}>
      <div style={{
        padding: '18px 22px 6px', borderBottom: '1px solid var(--rule)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      }}>
        <Marker>// agenda · {mode === 'wishlist' ? 'all starred' : 'all tracked'}</Marker>
        <span className="t-mono t-faint" style={{ fontSize: 'var(--text-3xs)' }}>{items.length} items</span>
      </div>

      {items.map((release) => {
        const date = releaseDateColumn(release);
        const away = daysUntil(release.releaseDate);
        const isPast = release.releaseDate !== null && away < 0;
        const isStarred = release.wishlisted;
        const baseStyle = {
          display: 'grid', gridTemplateColumns: '52px 32px 1fr auto', gap: 12,
          padding: '14px 22px',
          borderBottom: '1px dotted var(--rule)', alignItems: 'center',
          background: isStarred ? 'rgba(212,160,23,0.04)' : 'transparent',
        } as const;

        const Row = onItemClick ? 'button' : 'div';
        const interactive = onItemClick !== undefined;

        return (
          <Row
            key={release.igdbId}
            {...(interactive ? {
              type: 'button' as const,
              onClick: () => onItemClick(release.igdbId),
              'aria-label': `Open ${release.title}`,
            } : {})}
            style={{
              ...baseStyle,
              ...(interactive ? {
                width: '100%', border: 'none', borderBottom: '1px dotted var(--rule)',
                cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit',
              } : {}),
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div className="t-up t-faint" style={{ fontSize: 'var(--text-3xs)' }}>{date.month}</div>
              <div className="t-display" style={{
                fontSize: 'var(--text-md)',
                color: isStarred ? 'var(--amber)' : 'var(--paper)',
                lineHeight: 1,
              }}>{date.day}</div>
            </div>

            <Cover w={32} h={42} src={release.coverUrl} label={(release.title[0] ?? '').toUpperCase()} bright={isStarred} />

            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'var(--text-xs)', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {release.title}
              </div>
              <div className="t-faint" style={{ fontSize: 'var(--text-3xs)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {release.developer ?? '—'}
                {release.platforms[0] && ` · ${release.platforms[0]}`}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div className="t-tnum" style={{
                fontSize: 'var(--text-xs)',
                color: isStarred ? 'var(--amber)' : 'var(--paper-dim)',
              }}>
                {!release.releaseDate ? 'TBA' : isPast ? `+${Math.abs(away)}d` : `T-${away}d`}
              </div>
              {isStarred && (
                <div className="t-amber" style={{ marginTop: 2 }}>
                  <Icon name="star" size={10} fill={true} />
                </div>
              )}
            </div>
          </Row>
        );
      })}
    </aside>
  );
}
