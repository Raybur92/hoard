import { memo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Icon } from '../primitives/Icon';
import { Plat } from '../primitives/Plat';
import { api } from '../../lib/api';
import { useUser } from '../../contexts/UserContext';
import { useQuery } from '../../hooks/useQuery';
import { useLensIndex } from '../../hooks/useLensIndex';
import { slugifyTag } from '../../lib/tagSlug';
import type { GameStatus, PlatformStatusResponse, LensIndexEntry } from '@hoard/types';

export interface SidebarProps {
  shelfCounts?: Partial<Record<string, number>>;
}

const NAV_ITEMS = [
  { label: 'Dashboard', icon: 'dotO',   path: '/' },
  { label: 'Library',   icon: 'menu',   path: '/library' },
  { label: 'Releases',  icon: 'star',   path: '/releases' },
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

interface BrowseByGroupsProps {
  lensIndex: { genre: LensIndexEntry[]; theme: LensIndexEntry[]; perspective: LensIndexEntry[] } | null;
  location: { pathname: string };
  onNavigate: (path: string) => void;
}

const SIDEBAR_TOP_N = 5;

interface BrowseByGroupProps {
  label: string;
  routeBase: string; // '/library/by-genre' etc.
  values: LensIndexEntry[];
  activeSlug: string | null;
  onNavigate: (path: string) => void;
}

function BrowseByGroup({ label, routeBase, values, activeSlug, onNavigate }: BrowseByGroupProps) {
  // Auto-open when a value in this dimension is active; otherwise
  // collapsed by default. User can still toggle via the header.
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const [showAll, setShowAll] = useState(false);
  const hasActive = activeSlug !== null && values.some((v) => slugifyTag(v.name) === activeSlug);
  const open = openOverride ?? hasActive;
  if (values.length === 0) return null;
  const visible = showAll ? values : values.slice(0, SIDEBAR_TOP_N);
  const remaining = values.length - SIDEBAR_TOP_N;
  return (
    <>
      <button
        type="button"
        className="item"
        onClick={() => setOpenOverride(!open)}
        aria-expanded={open}
        data-testid={`sidebar-browse-${label}`}
        style={{ width: '100%', textAlign: 'left' }}
      >
        <span className="glyph" aria-hidden="true" style={{ opacity: 0.6 }}>{open ? '▾' : '▸'}</span>
        <span>{label}</span>
        <span className="count">{values.length}</span>
      </button>
      {open && (
        <>
          {visible.map((v) => {
            const slug = slugifyTag(v.name);
            const path = `${routeBase}/${slug}`;
            const isActive = activeSlug === slug;
            return (
              <button
                key={v.name}
                type="button"
                className={`item${isActive ? ' active' : ''}`}
                onClick={() => onNavigate(path)}
                aria-current={isActive ? 'page' : undefined}
                style={{ paddingLeft: 40 }}
                data-testid={`sidebar-browse-${label}-opt-${slug}`}
              >
                <span style={{
                  flex: 1, minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{v.name.toLowerCase()}</span>
                <span className="count">{v.count}</span>
              </button>
            );
          })}
          {!showAll && remaining > 0 && (
            <button
              type="button"
              className="item"
              onClick={() => setShowAll(true)}
              data-testid={`sidebar-browse-${label}-showall`}
              style={{ paddingLeft: 40, color: 'var(--paper-dim)' }}
            >
              <span style={{ fontSize: 'var(--text-2xs)' }}>show all {values.length} →</span>
            </button>
          )}
        </>
      )}
    </>
  );
}

function BrowseByGroups({ lensIndex, location, onNavigate }: BrowseByGroupsProps) {
  if (!lensIndex) return null;
  const any = lensIndex.genre.length || lensIndex.theme.length || lensIndex.perspective.length;
  if (!any) return null;
  // Active lens detection — surfaces the current selection so the
  // matching group auto-expands and the active value is highlighted.
  const pathname = location.pathname;
  const matchGenre = /^\/library\/by-genre\/(.+?)\/?$/.exec(pathname);
  const matchTheme = /^\/library\/by-theme\/(.+?)\/?$/.exec(pathname);
  const matchPersp = /^\/library\/by-perspective\/(.+?)\/?$/.exec(pathname);
  return (
    <>
      <div className="group">// browse by</div>
      <BrowseByGroup
        label="genre"
        routeBase="/library/by-genre"
        values={lensIndex.genre}
        activeSlug={matchGenre?.[1] ?? null}
        onNavigate={onNavigate}
      />
      <BrowseByGroup
        label="theme"
        routeBase="/library/by-theme"
        values={lensIndex.theme}
        activeSlug={matchTheme?.[1] ?? null}
        onNavigate={onNavigate}
      />
      <BrowseByGroup
        label="perspective"
        routeBase="/library/by-perspective"
        values={lensIndex.perspective}
        activeSlug={matchPersp?.[1] ?? null}
        onNavigate={onNavigate}
      />
    </>
  );
}

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
  // B-IGDB-3b2 follow-up — Steam-style left-rail browse-by. Always-
  // visible lens navigation, collapsible per dimension. Replaces the
  // duplicate BrowseByPanel-on-/library-overview placement on desktop;
  // mobile keeps the inline panel since there's no sidebar there.
  const { data: lensIndex } = useLensIndex();
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

      {/* B-IGDB-3b2 follow-up — Steam-style browse-by left-rail. Three
          collapsible dimension groups; each defaults to collapsed (just
          the header + count visible). Click a header to expand top-N
          values + "show all" toggle. Click any value → navigate to the
          primary-lens route. Renders only when lens-index has data. */}
      <BrowseByGroups
        lensIndex={lensIndex}
        location={location}
        onNavigate={navigate}
      />

      {/* Closed-beta admin entry — only rendered for users with the
          isAdmin column flipped (just Andrea in v1, per I-D2). The
          server enforces access via requireAdmin → 404; this is a
          UI affordance, not a security boundary. */}
      {user?.isAdmin && (
        <>
          <div className="group">// admin</div>
          <button
            type="button"
            className={`item${isActive('/admin') ? ' active' : ''}`}
            onClick={() => navigate('/admin')}
            aria-current={isActive('/admin') ? 'page' : undefined}
          >
            <span className="glyph"><Icon name="user" size={12} /></span>
            <span>Admin</span>
          </button>
        </>
      )}

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
