import { NavLink, Outlet } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useAdminUsers } from '../../../hooks/useAdminUsers';
import { useAdminInviteCodes } from '../../../hooks/useAdminInviteCodes';
import { useAdminFeedback } from '../../../hooks/useAdminFeedback';
import * as cache from '../../../lib/cache';
import { api } from '../../../lib/api';

// Admin-IA redesign (2026-05-29): sidebar + outlet layout, replaces the
// monolithic single-column AdminScreen. Each sub-route renders its own
// section into the outlet; the sidebar holds the global nav + the
// [refresh] button. Count badges read from the same SWR hooks that the
// section pages use — same cache, dedupes naturally.

type NavItem = {
  to: string;
  label: string;
  /** Optional count badge text rendered to the right of the label. */
  count?: number | string;
  /** Optional accent color for an "actionable" count (e.g. unread feedback,
   *  pending requests). Defaults to the neutral paper-dim color. */
  accent?: 'amber' | 'green' | null;
};

function NavRow({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) => `admin-nav ${isActive ? 'active' : ''}`}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        padding: '8px 12px',
        textDecoration: 'none',
        color: isActive ? 'var(--paper)' : 'var(--paper-dim)',
        background: isActive ? 'var(--ink-2)' : 'transparent',
        borderLeft: `2px solid ${isActive ? 'var(--amber)' : 'transparent'}`,
        fontSize: 'var(--text-xs)',
        fontFamily: 'var(--mono)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      })}
    >
      <span>{isActiveMarker(item.label)}</span>
      {item.count !== undefined && (
        <span
          className="t-mono"
          style={{
            fontSize: 'var(--text-3xs)',
            color:
              item.accent === 'amber'
                ? 'var(--amber)'
                : item.accent === 'green'
                  ? 'var(--green)'
                  : 'var(--paper-faint)',
            letterSpacing: '0.04em',
          }}
        >
          {item.count}
        </span>
      )}
    </NavLink>
  );
}

// Quirk for the terminal aesthetic — the label is rendered as-is; the
// > marker is added via CSS on the active state. Kept as a helper so
// the marker logic can evolve without touching every label.
function isActiveMarker(label: string): string {
  return label;
}

export function AdminLayout() {
  const { data: usersData } = useAdminUsers();
  const { data: codesData } = useAdminInviteCodes();
  const { items: feedback, unreadCount } = useAdminFeedback();
  const [syncingEvents, setSyncingEvents] = useState(false);
  const [syncEventsResult, setSyncEventsResult] = useState<string | null>(null);

  const users = useMemo(() => usersData?.users ?? [], [usersData]);
  const codes = useMemo(() => codesData?.codes ?? [], [codesData]);

  const pendingCount = useMemo(
    () => users.filter((u) => u.status === 'PENDING_INVITE' && u.hasRequestedAccess).length,
    [users],
  );

  const items: NavItem[] = [
    {
      to: '/admin/pending',
      label: 'pending',
      ...(pendingCount > 0
        ? { count: pendingCount, accent: 'amber' as const }
        : { count: 0, accent: null }),
    },
    { to: '/admin/users', label: 'users', count: users.length, accent: null },
    { to: '/admin/codes', label: 'codes', count: codes.length, accent: null },
    {
      to: '/admin/feedback',
      label: 'feedback',
      count: feedback.length,
      // Accent green when there's unread — surfaces actionable work in the nav.
      ...(unreadCount > 0 ? { accent: 'green' as const } : { accent: null }),
    },
    { to: '/admin/events', label: 'events', count: '∞', accent: null },
  ];

  // Shared refresh: invalidate the admin: prefix so the SWR hooks all
  // refetch on next read. Each page's data drops back to loading until
  // the new payload lands.
  const refresh = () => cache.invalidate('admin:');

  // EV-PR1 — IGDB showcase/industry event sync trigger.
  async function handleSyncEvents() {
    setSyncingEvents(true);
    setSyncEventsResult(null);
    try {
      const result = await api.admin.syncIgdbEvents();
      setSyncEventsResult(`// ${result.eventsUpserted} events · ${result.gameLinksUpserted} game links · ${result.scanned} scanned`);
    } catch (e) {
      setSyncEventsResult(`// error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncingEvents(false);
    }
  }

  return (
    <div className="thin-scroll" style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '32px 40px 48px', display: 'grid', gridTemplateColumns: '200px 1fr', gap: 32, alignItems: 'start' }}>
        {/* ─── Sidebar ────────────────────────────────────────────── */}
        <aside style={{ position: 'sticky', top: 32, alignSelf: 'start' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <h1
              className="t-mono"
              style={{ fontSize: 'var(--text-md)', color: 'var(--paper)', margin: 0, letterSpacing: '0.04em' }}
            >
              &gt; admin
            </h1>
          </div>
          <nav aria-label="Admin sections" style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
            {items.map((it) => <NavRow key={it.to} item={it} />)}
          </nav>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              type="button"
              onClick={refresh}
              className="t-mono t-faint"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: 'var(--text-xs)',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                padding: 6,
                textAlign: 'left',
              }}
            >
              [refresh]
            </button>
            <button
              type="button"
              onClick={() => void handleSyncEvents()}
              disabled={syncingEvents}
              className="t-mono t-faint"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: syncingEvents ? 'default' : 'pointer',
                fontSize: 'var(--text-xs)',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                padding: 6,
                textAlign: 'left',
                opacity: syncingEvents ? 0.5 : 1,
              }}
              aria-label="Sync IGDB showcase and industry events"
            >
              {syncingEvents ? '[syncing events…]' : '[sync igdb events]'}
            </button>
            {syncEventsResult && (
              <div
                className="t-mono t-faint"
                style={{ fontSize: 'var(--text-2xs)', padding: '4px 6px', lineHeight: 1.5 }}
              >
                {syncEventsResult}
              </div>
            )}
          </div>
        </aside>

        {/* ─── Content ────────────────────────────────────────────── */}
        <main style={{ minWidth: 0 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;
