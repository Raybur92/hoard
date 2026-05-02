import { useNavigate, useLocation } from 'react-router-dom';
import { Icon } from '../primitives/Icon';
import { Plat } from '../primitives/Plat';

export interface SidebarProps {
  syncStatus?: Record<string, { label: string; status: 'ok' | 'error' | 'stale' | 'syncing' | 'manual' }>;
  shelfCounts?: Partial<Record<string, number>>;
}

const NAV_ITEMS = [
  { label: 'Dashboard', icon: 'dotO',   path: '/' },
  { label: 'Library',   icon: 'menu',   path: '/library' },
  { label: 'Upcoming',  icon: 'star',   path: '/upcoming' },
] as const;

const DEFAULT_SHELVES = [
  { label: 'Playing',   color: 'var(--green)' },
  { label: 'Backlog',   color: null },
  { label: 'Completed', color: null },
  { label: 'On Hold',   color: null },
  { label: 'Dropped',   color: null },
  { label: 'Wishlist',  color: 'var(--amber)' },
] as const;

const PLATFORMS = [
  { label: 'Steam', code: 'ST' },
  { label: 'PSN',   code: 'PS' },
  { label: 'Xbox',  code: 'XB' },
  { label: 'GOG',   code: 'GG' },
] as const;

export function Sidebar({ syncStatus, shelfCounts }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <aside className="sidebar">
      <div style={{ padding: '0 22px 18px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="t-display" style={{ fontSize: 22, color: 'var(--paper)', letterSpacing: '0.04em' }}>hoard</span>
        <span className="t-faint" style={{ fontSize: 9 }}>v0.1</span>
      </div>

      <div className="group">// command</div>
      {NAV_ITEMS.map(({ label, icon, path }) => (
        <div
          key={label}
          className={`item${isActive(path) ? ' active' : ''}`}
          onClick={() => navigate(path)}
        >
          <span className="glyph"><Icon name={icon} size={12} /></span>
          <span>{label}</span>
        </div>
      ))}

      <div className="group">// shelves</div>
      {DEFAULT_SHELVES.map(({ label, color }) => (
        <div
          key={label}
          className="item"
          onClick={() => navigate(`/library/${label.toLowerCase().replace(' ', '-')}`)}
        >
          <span className="glyph" style={{ color: color ?? undefined }}>
            <Icon name="dotO" size={8} fill={true} />
          </span>
          <span>{label}</span>
          <span className="count">{shelfCounts?.[label] ?? ''}</span>
        </div>
      ))}

      <div className="group">// platforms</div>
      {PLATFORMS.map(({ label, code }) => {
        const s = syncStatus?.[code];
        return (
          <div key={code} className="item">
            <span className="glyph"><Plat code={code} /></span>
            <span>{label}</span>
            {s && (
              <span className="count" style={{ color: s.status === 'ok' ? 'var(--green)' : 'var(--paper-faint)' }}>
                <Icon name="dotO" size={8} fill={true} />
              </span>
            )}
          </div>
        );
      })}

      <div style={{ flex: 1 }} />
      <div style={{ padding: '14px 22px', borderTop: '1px solid var(--rule)', fontSize: 10, color: 'var(--paper-faint)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 22, height: 22, background: 'var(--ink-3)', border: '1px solid var(--rule-bright)' }} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: 'var(--paper)', fontSize: 11 }}>andrea</span>
          <span style={{ fontSize: 9 }}>since 2023</span>
        </div>
      </div>
    </aside>
  );
}
