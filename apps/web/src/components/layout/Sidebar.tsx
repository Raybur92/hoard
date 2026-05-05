import { memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Icon } from '../primitives/Icon';
import { Plat } from '../primitives/Plat';
import { api } from '../../lib/api';
import { useUser } from '../../contexts/UserContext';
import { useQuery } from '../../hooks/useQuery';
import type { GameStatus, PlatformStatusResponse } from '@hoard/types';

export interface SidebarProps {
  shelfCounts?: Partial<Record<string, number>>;
}

const NAV_ITEMS = [
  { label: 'Dashboard', icon: 'dotO',   path: '/' },
  { label: 'Library',   icon: 'menu',   path: '/library' },
  { label: 'Upcoming',  icon: 'star',   path: '/upcoming' },
  { label: 'Settings',  icon: 'cog',    path: '/settings' },
] as const;

const DEFAULT_SHELVES = [
  { label: 'Playing',   color: 'var(--green)' },
  { label: 'On Hold',   color: null },
  { label: 'Completed', color: null },
  { label: 'Backlog',   color: null },
  { label: 'Dropped',   color: null },
  { label: 'Wishlist',  color: 'var(--amber)' },
] as const;

const PLATFORMS = [
  { label: 'Steam', code: 'ST' },
  { label: 'PSN',   code: 'PS' },
  { label: 'Xbox',  code: 'XB' },
  { label: 'GOG',   code: 'GG' },
] as const;

function SidebarImpl({ shelfCounts: shelfCountsProp }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useUser();
  const { data: platformStatus } = useQuery<PlatformStatusResponse>(
    'platformStatus',
    () => api.platformStatus(),
  );
  const { data: countsData } = useQuery<{ counts: Partial<Record<GameStatus, number>> }>(
    'gameCounts',
    () => api.gameCounts(),
  );
  const platforms = platformStatus?.platforms ?? [];
  const fetchedCounts = countsData?.counts ?? {};

  const shelfCounts = shelfCountsProp ?? fetchedCounts;

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <aside className="sidebar">
      <div style={{ padding: '0 22px 18px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="t-display" style={{ fontSize: "var(--text-lg)", color: 'var(--paper)', letterSpacing: '0.04em' }}>hoard</span>
        <span className="t-faint" style={{ fontSize: "var(--text-2xs)" }}>v0.1</span>
      </div>

      <div className="group">// command</div>
      {NAV_ITEMS.map(({ label, icon, path }) => (
        <button
          key={label}
          type="button"
          className={`item${isActive(path) ? ' active' : ''}`}
          onClick={() => navigate(path)}
          aria-current={isActive(path) ? 'page' : undefined}
        >
          <span className="glyph"><Icon name={icon} size={12} /></span>
          <span>{label}</span>
        </button>
      ))}

      <div className="group">// shelves</div>
      {DEFAULT_SHELVES.map(({ label, color }) => (
        <button
          key={label}
          type="button"
          className="item"
          onClick={() => navigate(`/library/${encodeURIComponent(label)}`)}
        >
          <span className="glyph" style={{ color: color ?? undefined }}>
            <Icon name="dotO" size={8} fill={true} />
          </span>
          <span>{label}</span>
          <span className="count">{shelfCounts?.[label] ?? ''}</span>
        </button>
      ))}

      <div className="group">// platforms</div>
      {PLATFORMS.map(({ label, code }) => {
        const p = platforms.find((pl) => pl.code === code);
        const dotColor = !p ? undefined
          : p.syncStatus === 'ok' ? 'var(--green)'
          : p.syncStatus === 'stale' ? 'var(--amber)'
          : p.syncStatus === 'error' ? 'var(--red)'
          : p.syncStatus === 'syncing' ? 'var(--green)'
          : undefined;
        return (
          <button key={code} type="button" className="item" onClick={() => navigate(`/settings/platforms/${code.toLowerCase()}`)}>
            <span className="glyph"><Plat code={code} /></span>
            <span>{label}</span>
            {dotColor && (
              <span className="count" style={{ color: dotColor }}>
                <Icon name="dotO" size={8} fill={true} />
              </span>
            )}
          </button>
        );
      })}

      <div style={{ flex: 1 }} />
      <div style={{ padding: '14px 22px', borderTop: '1px solid var(--rule)', fontSize: "var(--text-3xs)", color: 'var(--paper-dim)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 22, height: 22, background: 'var(--ink-3)', border: '1px solid var(--rule-bright)', flexShrink: 0 }} aria-hidden="true" />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <span data-testid="sidebar-username" style={{ color: 'var(--paper)', fontSize: "var(--text-2xs)" }}>{user?.name ?? '…'}</span>
          <span style={{ fontSize: "var(--text-2xs)" }}>since {user ? new Date(user.createdAt).getFullYear() : '…'}</span>
        </div>
        <button
          type="button"
          aria-label="Sign out"
          title="sign out"
          style={{ background: 'transparent', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--paper-dim)', flexShrink: 0, lineHeight: 1 }}
          onClick={() => { void signOut().then(() => navigate('/login')); }}
        >
          <Icon name="x" size={11} />
        </button>
      </div>
    </aside>
  );
}

export const Sidebar = memo(SidebarImpl);
