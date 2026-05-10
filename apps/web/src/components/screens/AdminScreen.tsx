import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useUser } from '../../contexts/UserContext';
import { useAdminUsers } from '../../hooks/useAdminUsers';
import { useAdminInviteCodes } from '../../hooks/useAdminInviteCodes';
import { Btn } from '../primitives/Btn';
import { Chip } from '../primitives/Chip';
import { ConfirmModal } from '../modals/ConfirmModal';
import { api } from '../../lib/api';
import * as cache from '../../lib/cache';
import { GenerateCodeModal } from './GenerateCodeModal';
import type { AdminUser, AdminInviteCode } from '@hoard/types';

type FilterKey = 'all' | 'active' | 'pending' | 'admin';
type SortKey = 'joined' | 'status' | 'platforms';

const FILTER_KEYS: FilterKey[] = ['all', 'active', 'pending', 'admin'];
const SORT_CYCLE: SortKey[] = ['joined', 'status', 'platforms'];

// "active" excludes admins per A-D9 (strict semantics — admins are
// their own bucket so the four chip counts partition the user list).
function matchesFilter(u: AdminUser, f: FilterKey): boolean {
  if (f === 'all') return true;
  if (f === 'active') return u.status === 'ACTIVE' && !u.isAdmin;
  if (f === 'pending') return u.status === 'PENDING_INVITE';
  return u.isAdmin;
}

/**
 * Admin panel — closed-beta workstream I5. Three sections per spec §7.1:
 *   1. PENDING ACCESS REQUESTS (users who clicked "Request access")
 *   2. ALL USERS (terminal-style aligned table)
 *   3. INVITE CODES (with [revoke] on unused rows)
 *
 * Desktop-only per I-D3 — below 1024px renders a centered terminal-style
 * fallback rather than a mobile parity port. Reasoning in
 * docs/INVITE_CODES_PLAN.md: admin work is rare and laptop-friendly,
 * not worth the parity-port effort for a single-admin v1.
 *
 * Defense-in-depth: this component checks `currentUser.isAdmin` and
 * renders a 404 view for non-admins. Sidebar already hides the entry,
 * but typing /admin in the URL bar shouldn't reveal what's there. The
 * server returns 404 (not 403) on /api/admin/* for non-admins per
 * I-D15, so this matches the URL-level invisibility story.
 */
export function AdminScreen() {
  useDocumentTitle('hoard · admin');
  const bp = useBreakpoint();
  const { user } = useUser();

  // Mobile fallback (per I-D3) — desktop-only screen.
  if (bp !== 'desktop') {
    return <MobileFallback />;
  }

  // Defensive non-admin view. Sidebar hides the entry but URL-typing
  // shouldn't reveal anything. Server already 404s; this matches.
  if (!user?.isAdmin) {
    return <NotFoundView />;
  }

  return <AdminScreenImpl />;
}

function AdminScreenImpl() {
  const { user: currentUser } = useUser();
  const { data: usersData, loading: usersLoading, error: usersError } = useAdminUsers();
  const { data: codesData, loading: codesLoading, error: codesError } = useAdminInviteCodes();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateNote, setGenerateNote] = useState<string>('');

  // Filter / sort / search state lives in the URL per A-D5. Defaults
  // are omitted from the URL so shareable /admin links stay clean.
  const [searchParams, setSearchParams] = useSearchParams();
  const filter: FilterKey =
    (searchParams.get('filter') as FilterKey | null) ?? 'all';
  const sortKey: SortKey =
    (searchParams.get('sort') as SortKey | null) ?? 'joined';
  const q = searchParams.get('q') ?? '';

  function setUrlParam(key: string, value: string, defaultValue: string) {
    const next = new URLSearchParams(searchParams);
    if (value === defaultValue || value === '') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  // Delete-user modal state. `target` carries the user being deleted;
  // `confirmText` is the typed-confirm input value; `working` blocks
  // double-clicks while the API call is in flight.
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Toast state. After a successful delete, show a green inline
  // // deleted: <displayIdentity> banner under the toolbar for 1.5s.
  // Banner sits above the section header (viewport-stable position
  // within the page scroll, NOT anchored to the vacated row — the row
  // disappears via cache invalidation, so anchoring would mean
  // rendering against a row that's about to vanish).
  const [lastDeleted, setLastDeleted] = useState<string | null>(null);
  useEffect(() => {
    if (lastDeleted === null) return;
    const id = setTimeout(() => setLastDeleted(null), 1500);
    return () => clearTimeout(id);
  }, [lastDeleted]);

  // Memoize `users` so its identity is stable across renders when the
  // underlying SWR data hasn't changed — keeps the pendingRequests
  // useMemo from invalidating on every parent render.
  const users = useMemo(() => usersData?.users ?? [], [usersData]);
  const codes = useMemo(() => codesData?.codes ?? [], [codesData]);

  // Derived: pending users who actually requested access (the rest live
  // only in the ALL USERS section). Server already returns these
  // first; we just slice off the prefix.
  const pendingRequests = useMemo(
    () => users.filter((u) => u.status === 'PENDING_INVITE' && u.hasRequestedAccess),
    [users],
  );

  // Filter chip counts always reflect the full dataset, not the
  // currently-selected slice — so the chips read as `[ all (8) ]`
  // / `[ active (5) ]` etc. regardless of the active filter.
  const filterCounts = useMemo(
    () => ({
      all: users.length,
      active: users.filter((u) => matchesFilter(u, 'active')).length,
      pending: users.filter((u) => matchesFilter(u, 'pending')).length,
      admin: users.filter((u) => matchesFilter(u, 'admin')).length,
    }),
    [users],
  );

  // Apply filter → search → sort. Each step preserves the order of
  // the prior, so sorting by `status` after filtering by `active`
  // doesn't try to bucket non-active rows we already removed.
  const visibleUsers = useMemo(() => {
    let out = users.filter((u) => matchesFilter(u, filter));
    if (q) {
      const ql = q.toLowerCase();
      out = out.filter(
        (u) =>
          u.email.toLowerCase().includes(ql) ||
          (u.name?.toLowerCase().includes(ql) ?? false) ||
          u.displayIdentity.toLowerCase().includes(ql),
      );
    }
    const sorted = [...out];
    if (sortKey === 'joined') {
      sorted.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    } else if (sortKey === 'platforms') {
      sorted.sort(
        (a, b) =>
          b.platforms.count - a.platforms.count ||
          Date.parse(b.createdAt) - Date.parse(a.createdAt),
      );
    } else if (sortKey === 'status') {
      // Bucket: pending (0) → active (1) → admin (2). Secondary by
      // createdAt desc so within-bucket ordering is stable + useful.
      const bucket = (u: AdminUser) =>
        u.status === 'PENDING_INVITE' ? 0 : u.isAdmin ? 2 : 1;
      sorted.sort(
        (a, b) =>
          bucket(a) - bucket(b) ||
          Date.parse(b.createdAt) - Date.parse(a.createdAt),
      );
    }
    return sorted;
  }, [users, filter, q, sortKey]);

  const refresh = () => {
    cache.invalidate('admin:');
  };

  const openGenerate = (note?: string) => {
    setGenerateNote(note ?? '');
    setGenerateOpen(true);
  };

  const closeGenerate = () => {
    setGenerateOpen(false);
    setGenerateNote('');
  };

  const openDelete = (u: AdminUser) => {
    setDeleteTarget(u);
    setDeleteConfirmText('');
  };

  const closeDelete = () => {
    if (deleting) return; // can't bail mid-flight
    setDeleteTarget(null);
    setDeleteConfirmText('');
  };

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    // Server-side self-protection (A-D2 belt-and-suspenders) — but the
    // [delete] button is hidden on the admin's own row so this check
    // is also a paranoia guard against future regressions.
    if (currentUser && currentUser.id === deleteTarget.id) {
      setDeleteTarget(null);
      setDeleteConfirmText('');
      return;
    }
    setDeleting(true);
    try {
      await api.admin.deleteUser(deleteTarget.id);
      // Cache invalidation already fires inside api.admin.deleteUser.
      setLastDeleted(deleteTarget.displayIdentity);
      setDeleteTarget(null);
      setDeleteConfirmText('');
    } catch (err) {
      // Surface error inline. A real production-error UI would be a
      // banner; for closed-beta the alert is acceptable.
      alert(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  }

  // Sort cycle button label per A-D11-implementation: status doesn't
  // have a natural direction (it's bucket-based), so the ↓ arrow is
  // shown only for joined + platforms. Single label-button cycles
  // through joined → status → platforms → joined; clicking advances.
  const sortIndex = SORT_CYCLE.indexOf(sortKey);
  const cycleSort = () => {
    const next = SORT_CYCLE[(sortIndex + 1) % SORT_CYCLE.length] ?? 'joined';
    setUrlParam('sort', next, 'joined');
  };
  const sortLabel = sortKey === 'joined'
    ? 'sort: joined ↓'
    : sortKey === 'platforms'
      ? 'sort: platforms ↓'
      : 'sort: status';

  return (
    // Scroll container — `.app-main` has overflow:hidden and expects each
    // screen to provide its own `flex: 1; overflow: auto` child (same
    // pattern as DashboardDesktop, LibraryDesktop, etc.). Without this
    // wrapper, content past 100dvh was invisible — page didn't scroll
    // at all on desktop.
    <div className="thin-scroll" style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '32px 40px 48px' }}>
        {/* ─── Top bar ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1
          className="t-mono"
          style={{ fontSize: 'var(--text-lg)', color: 'var(--paper)', margin: 0, letterSpacing: '0.02em' }}
        >
          &gt; HOARD ADMIN
        </h1>
        <button
          type="button"
          onClick={refresh}
          className="t-mono t-faint"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.12em',
            padding: 6,
          }}
        >
          [refresh]
        </button>
      </div>
      <div style={{ height: 1, background: 'var(--rule)', marginBottom: 24 }} />

      {/* Generate code CTA */}
      <Btn variant="primary" onClick={() => openGenerate()} style={{ marginBottom: 32 }}>
        + generate code
      </Btn>

      {/* ─── Pending access requests ──────────────────────────── */}
      <SectionHeader label="pending access requests" count={pendingRequests.length} />
      {usersLoading && pendingRequests.length === 0 ? (
        <div className="t-mono t-faint" style={{ fontSize: 'var(--text-xs)', padding: '8px 0' }}>// loading…</div>
      ) : usersError ? (
        <ErrorBlock message={usersError} />
      ) : pendingRequests.length === 0 ? (
        <EmptyLine text="// no pending requests" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 32 }}>
          {pendingRequests.map((u) => (
            <PendingRequestRow key={u.id} user={u} onGenerate={(note) => openGenerate(note)} />
          ))}
        </div>
      )}

      {/* ─── All users ────────────────────────────────────────── */}
      <SectionHeader label="all users" count={users.length} />

      {/* Toolbar: filter chips + search + sort cycle (A-D5/A-D8/A-D9). */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTER_KEYS.map((f) => (
            <Chip
              key={f}
              on={filter === f}
              onClick={() => setUrlParam('filter', f, 'all')}
              ariaLabel={`Filter users: ${f}`}
            >
              {f} ({filterCounts[f]})
            </Chip>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
          <input
            type="search"
            value={q}
            onChange={(e) => setUrlParam('q', e.target.value, '')}
            placeholder="find by email or name…"
            aria-label="Search users by email or name"
            className="t-mono"
            style={{
              flex: 1,
              maxWidth: 280,
              height: 30,
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--mono)',
              background: 'var(--ink-2)',
              border: '1px solid var(--rule)',
              color: 'var(--paper)',
              padding: '0 10px',
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={cycleSort}
            className="t-mono t-faint"
            aria-label={`Cycle sort: currently ${sortLabel}`}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: 'var(--text-xs)',
              textTransform: 'uppercase',
              letterSpacing: '0.10em',
              padding: 6,
              whiteSpace: 'nowrap',
            }}
          >
            [ {sortLabel} ]
          </button>
        </div>
      </div>

      {/* Deleted toast — viewport-stable position within page scroll,
        * NOT anchored to the vacated row. The row disappears via cache
        * invalidation, so anchoring would mean rendering against a
        * row about to vanish (visual jump). Sits between toolbar and
        * data so it's adjacent to the affected list. */}
      {lastDeleted && (
        <div
          role="status"
          aria-live="polite"
          className="t-mono"
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--green)',
            padding: '6px 10px',
            border: '1px solid var(--green)',
            background: 'rgba(95,194,106,0.06)',
            marginBottom: 12,
            letterSpacing: '0.04em',
          }}
        >
          // deleted: {lastDeleted}
        </div>
      )}

      {usersLoading && users.length === 0 ? (
        <div className="t-mono t-faint" style={{ fontSize: 'var(--text-xs)', padding: '8px 0' }}>// loading…</div>
      ) : usersError ? (
        <ErrorBlock message={usersError} />
      ) : users.length === 0 ? (
        <EmptyLine text="// no users" />
      ) : visibleUsers.length === 0 ? (
        <EmptyLine text={q ? `// no users match "${q}"` : '// no users in this filter'} />
      ) : (
        <div style={{ marginBottom: 32 }}>
          <UserHeaderRow />
          {visibleUsers.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              currentUserId={currentUser?.id ?? null}
              onDelete={openDelete}
            />
          ))}
        </div>
      )}

      {/* ─── Invite codes ─────────────────────────────────────── */}
      <SectionHeader label="invite codes" count={codes.length} />
      {codesLoading && codes.length === 0 ? (
        <div className="t-mono t-faint" style={{ fontSize: 'var(--text-xs)', padding: '8px 0' }}>// loading…</div>
      ) : codesError ? (
        <ErrorBlock message={codesError} />
      ) : codes.length === 0 ? (
        <EmptyLine text="// no invite codes yet" />
      ) : (
        <div>
          {codes.map((c) => <CodeRow key={c.id} code={c} />)}
        </div>
      )}

        {generateOpen && (
          <GenerateCodeModal
            initialNote={generateNote}
            onClose={closeGenerate}
          />
        )}

        {deleteTarget && (
          <ConfirmModal
            variant="delete-user"
            subject={deleteTarget.displayIdentity}
            confirmKeyword={deleteTarget.displayIdentity}
            confirmText={deleteConfirmText}
            working={deleting}
            onTextChange={setDeleteConfirmText}
            onConfirm={() => void handleConfirmDelete()}
            onCancel={closeDelete}
            details={{
              games: deleteTarget.gamesCount,
              platforms: deleteTarget.platforms.count,
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ── sub-components ────────────────────────────────────────── */

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <span
        className="t-mono"
        style={{
          fontSize: 'var(--text-xs)',
          textTransform: 'uppercase',
          letterSpacing: '0.16em',
          color: 'var(--paper-dim)',
        }}
      >
        // {label} ({count})
      </span>
      <div style={{ height: 1, background: 'var(--rule)', marginTop: 6 }} />
    </div>
  );
}

function PendingRequestRow({ user, onGenerate }: { user: AdminUser; onGenerate: (note: string) => void }) {
  // Both the button label AND the pre-fill note use the compact
  // noteLabel (User.name → email local-part → "Steam user — {steamId}").
  // The row's identity header above already shows the full
  // displayIdentity for ground-truth context, so the button doesn't
  // need to repeat it — "GENERATE CODE FOR DANIEL" reads cleaner than
  // "GENERATE CODE FOR DANIEL.GUERNIERI@GMAIL.COM" when the email is
  // already visible one line up.
  const compact = noteLabel(user);
  const noteHint = `for ${compact}`;
  return (
    <div className="panel" style={{ padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <span className="t-mono" style={{ fontSize: 'var(--text-sm)', color: 'var(--paper)' }}>
          {user.displayIdentity}
        </span>
        <span className="t-mono t-faint" style={{ fontSize: 'var(--text-3xs)' }}>
          {user.accessRequestedAt ? `requested ${relativeTime(user.accessRequestedAt)}` : ''}
        </span>
      </div>
      {user.accessRequestMessage ? (
        <div
          className="t-mono"
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--paper-dim)',
            marginTop: 8,
            paddingLeft: 12,
            borderLeft: '2px solid var(--rule)',
            lineHeight: 'var(--lh-relaxed)',
            fontStyle: 'italic',
          }}
        >
          &ldquo;{user.accessRequestMessage}&rdquo;
        </div>
      ) : (
        <div
          className="t-mono t-faint"
          style={{ fontSize: 'var(--text-3xs)', marginTop: 8, paddingLeft: 12 }}
        >
          (no message)
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <Btn onClick={() => onGenerate(noteHint)}>generate code for {compact}</Btn>
      </div>
    </div>
  );
}

// Grid template shared between UserHeaderRow and UserRow so the
// header columns line up perfectly with the data columns. 5 cols per
// A-D10: identity (1fr) / status (70px) / joined (80px) / platforms+
// games (180px) / actions (80px).
//
// Column widths — landed values after live-page eyeball:
//   - Platforms 130 → 180. The 130 the plan first specced was
//     consistently wrapping "N platforms · M games" to two lines once
//     M crossed ~3 digits ("488 games" / "395 games"). 180 fits the
//     longest production case ("4 platforms · 745 games" — Andrea's
//     row) cleanly on a single line at --text-3xs.
//   - Actions 56 → 80. The 56 was just-wide-enough for the right-
//     aligned [delete] text but left it visually butting against the
//     platforms column boundary. 80 gives ~24 px of breathing room
//     between the platforms cell content and the [delete] glyph.
//   - Identity (1fr) loses ~75 px of width vs the prior layout. Long
//     emails ("daniel.guernieri@gmail.com") still fit at typical
//     desktop widths (1280+); below ~1100 the ellipsis on overflow
//     handles it (the cell already has whiteSpace: nowrap +
//     textOverflow: ellipsis, plus title= for the full email on hover).
const USER_ROW_GRID = '1fr 70px 80px 180px 80px';

function UserHeaderRow() {
  return (
    <div
      role="row"
      style={{
        display: 'grid',
        gridTemplateColumns: USER_ROW_GRID,
        alignItems: 'baseline',
        padding: '6px 0',
        borderBottom: '1px solid var(--rule)',
        fontSize: 'var(--text-3xs)',
        fontFamily: 'var(--mono)',
        gap: 12,
        textTransform: 'uppercase',
        letterSpacing: '0.16em',
        color: 'var(--paper-dim)',
      }}
    >
      <span>// identity</span>
      <span>status</span>
      <span>joined</span>
      <span>platforms</span>
      <span style={{ textAlign: 'right' }}>actions</span>
    </div>
  );
}

function UserRow({
  user,
  currentUserId,
  onDelete,
}: {
  user: AdminUser;
  currentUserId: string | null;
  onDelete: (u: AdminUser) => void;
}) {
  // Identity merging per A-D10: render `<name> · <email>` when both are
  // set, else whichever is set, else displayIdentity (covers Steam-only
  // synthetic accounts). The displayIdentity helper already handles the
  // single-source case identically — using it as the fallback keeps
  // ground-truth behaviour consistent with the rest of the admin
  // surface (PendingRequestRow + ConfirmModal subject).
  const showBoth =
    user.name !== null &&
    user.name.length > 0 &&
    !user.email.startsWith('steam:'); // synthetic-Steam: name IS the displayIdentity
  const identityPrimary = showBoth ? user.name! : user.displayIdentity;
  const identitySecondary = showBoth ? user.email : null;

  const statusColor =
    user.status === 'ACTIVE'
      ? user.isAdmin
        ? 'var(--amber)'
        : 'var(--green)'
      : 'var(--paper-dim)';
  const statusLabel = user.isAdmin
    ? 'admin'
    : user.status === 'ACTIVE'
      ? 'active'
      : 'pending';
  const joined = new Date(user.createdAt).toISOString().slice(0, 10);

  // PLATFORMS column extension per A-D11(3): "<N> platforms · <M> games".
  // Game count first as the more useful scan signal; platforms-count
  // second for context (which storefronts they're connected to).
  // Singularised at boundaries. Em-dash when both are zero — keeps the
  // empty case from rendering "0 platforms · 0 games" noise.
  const hasAnyData = user.platforms.count > 0 || user.gamesCount > 0;
  const platformsLabel = hasAnyData
    ? `${user.platforms.count} ${user.platforms.count === 1 ? 'platform' : 'platforms'} · ${user.gamesCount} ${user.gamesCount === 1 ? 'game' : 'games'}`
    : '—';

  // Self-protection per A-D2: [delete] button never renders on the
  // admin's own row. Server-side 400 CANNOT_DELETE_SELF closes the
  // URL-typing path; this is the visibility hint.
  const isSelf = currentUserId !== null && user.id === currentUserId;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: USER_ROW_GRID,
        alignItems: 'baseline',
        padding: '4px 0',
        borderBottom: '1px dashed var(--rule)',
        fontSize: 'var(--text-xs)',
        fontFamily: 'var(--mono)',
        gap: 12,
      }}
    >
      <span
        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={user.email}
      >
        <span style={{ color: 'var(--paper)' }}>{identityPrimary}</span>
        {identitySecondary && (
          <>
            {' '}
            <span className="t-faint" style={{ fontSize: 'var(--text-3xs)' }}>
              · {identitySecondary}
            </span>
          </>
        )}
      </span>
      <span
        style={{
          color: statusColor,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontSize: 'var(--text-3xs)',
        }}
      >
        {statusLabel}
      </span>
      <span className="t-faint" style={{ fontSize: 'var(--text-3xs)' }}>
        {joined}
      </span>
      <span
        className="t-faint"
        style={{
          fontSize: 'var(--text-3xs)',
          // nowrap + overflow + ellipsis so an unexpectedly long
          // platform-count combo doesn't blow out the grid row at
          // narrow widths. The 180 px column fits every production
          // case today; this is the safety net for tomorrow.
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {platformsLabel}
      </span>
      <span style={{ textAlign: 'right' }}>
        {!isSelf && (
          <button
            type="button"
            onClick={() => onDelete(user)}
            className="t-mono"
            aria-label={`Delete ${user.displayIdentity}`}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: 'var(--text-3xs)',
              color: 'var(--red)',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              padding: 4,
            }}
          >
            [delete]
          </button>
        )}
      </span>
    </div>
  );
}

function CodeRow({ code }: { code: AdminInviteCode }) {
  const used = code.usedAt !== null;
  const usedAt = used ? new Date(code.usedAt!).toISOString().slice(0, 10) : '';
  const handleRevoke = async () => {
    // Confirm prompt — the action is destructive but not catastrophic
    // (the server only allows revoke on unused codes, so the user can't
    // accidentally yank an active person's code). Still, type-confirm
    // would be overkill; window.confirm is sufficient for v1.
    if (!window.confirm(`Revoke ${code.code}? This can't be undone.`)) return;
    try {
      await api.admin.deleteInviteCode(code.id);
      // Cache invalidation already fires inside api.admin.deleteInviteCode.
    } catch (err) {
      console.error('[admin] revoke failed:', err);
      alert(err instanceof Error ? err.message : 'Failed to revoke code');
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        // Code (180 px fixed) / note (minmax 120, 1fr) / used-by
        // (minmax 240, 2fr) / actions (110 px fixed).
        //
        // Two flexible columns sharing slack 1:2 — used-by gets
        // twice as much extra space as the note. The earlier
        // `180px 1fr 240px 110px` made note absorb all slack while
        // used-by stayed pegged at 240 px regardless of viewport
        // width; on a wide window with a short note ("for Giuseppe
        // Spizzico"), used-by truncated mid-email even though the
        // row had hundreds of unused pixels. Proportional slack
        // matches reality — used-by content is consistently longer
        // than note content (full email + " · " + ISO date), so
        // the 2fr weighting reflects the actual content bias.
        //
        // Minimums: note ≥ 120 px so a long note doesn't compress
        // to nothing on narrow widths; used-by ≥ 240 px so the
        // longest email-plus-date still fits at the floor.
        // Combined: row min-width 180 + 120 + 240 + 110 + 36 (3 gaps)
        // = 686 px — comfortably below the 724 px content area at
        // the 1024 px desktop floor.
        gridTemplateColumns:
          '180px minmax(120px, 1fr) minmax(240px, 2fr) 110px',
        alignItems: 'baseline',
        padding: '6px 0',
        borderBottom: '1px dashed var(--rule)',
        fontSize: 'var(--text-xs)',
        fontFamily: 'var(--mono)',
        gap: 12,
      }}
    >
      <code style={{ color: 'var(--paper)', letterSpacing: '0.04em' }}>{code.code}</code>
      <span className="t-faint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {code.note ?? '(no note)'}
      </span>
      <span
        className="t-faint"
        style={{
          fontSize: 'var(--text-3xs)',
          // Same nowrap + ellipsis safety net as the user-row
          // platforms cell — 240 px fits every production case today,
          // ellipsis catches future overflow rather than wrapping.
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {used ? `used by ${code.usedBy?.displayIdentity ?? '?'} · ${usedAt}` : 'unused'}
      </span>
      <span style={{ textAlign: 'right' }}>
        {!used && (
          <button
            type="button"
            onClick={() => void handleRevoke()}
            className="t-mono"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 'var(--text-3xs)', color: 'var(--red)',
              textTransform: 'uppercase', letterSpacing: '0.12em',
              padding: 4,
            }}
          >
            [revoke]
          </button>
        )}
      </span>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div
      className="t-mono t-faint"
      style={{ fontSize: 'var(--text-xs)', padding: '12px 0 28px' }}
    >
      {text}
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        padding: '10px 14px',
        border: '1px solid var(--red)',
        background: 'rgba(226,85,58,0.06)',
        fontSize: 'var(--text-xs)',
        color: 'var(--red)',
        marginBottom: 24,
      }}
    >
      // {message}
    </div>
  );
}

function MobileFallback() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48,
        minHeight: '60dvh',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 320 }}>
        <h1
          className="t-mono"
          style={{ fontSize: 'var(--text-md)', color: 'var(--paper)', margin: 0 }}
        >
          &gt; admin
        </h1>
        <p
          className="t-mono"
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--paper-dim)',
            lineHeight: 'var(--lh-relaxed)',
            marginTop: 12,
          }}
        >
          // admin panel is desktop-only · open hoard on a laptop or widen your browser
        </p>
        <div style={{ marginTop: 24 }}>
          <Link
            to="/"
            className="t-mono t-faint"
            style={{ fontSize: 'var(--text-3xs)', textTransform: 'uppercase', letterSpacing: '0.12em' }}
          >
            ← back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function NotFoundView() {
  // Defense-in-depth: matches the server's `{ error: 'Not found' }`
  // response for non-admin /api/admin/* requests. Page-level analogue.
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48,
        minHeight: '60dvh',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 360 }}>
        <h1
          className="t-mono"
          style={{ fontSize: 'var(--text-md)', color: 'var(--paper)', margin: 0 }}
        >
          &gt; 404
        </h1>
        <p
          className="t-mono t-faint"
          style={{ fontSize: 'var(--text-xs)', marginTop: 8 }}
        >
          // not found
        </p>
        <div style={{ marginTop: 24 }}>
          <Link
            to="/"
            className="t-mono t-faint"
            style={{ fontSize: 'var(--text-3xs)', textTransform: 'uppercase', letterSpacing: '0.12em' }}
          >
            ← back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ── helpers ──────────────────────────────────────────────── */

/**
 * Compact label used in two places on the admin page:
 *   - The `[generate code for X]` button label on each pending-request row.
 *   - The pre-fill note that lands on the resulting invite code.
 *
 * Optimized for "quick recognizer," NOT for "ground-truth identifier" —
 * the row above the button already shows the full `displayIdentity`
 * (which is `email` for real-email users, "Steam user — {steamId}" for
 * synthetic), so the button + note can use a shorter form without
 * losing identifying context.
 *
 * Precedence:
 *   1. user.name             → "Andrea" / "Bedkarma"
 *   2. real-email local-part → "marco" (when email isn't synthetic-Steam)
 *   3. fall back to displayIdentity (covers synthetic-Steam users
 *      without a name set, which renders as "Steam user — {steamId}")
 *
 * Mirrors the displayIdentity precedence rule (decision #34 framing)
 * but skips the "real email always wins" path that displayIdentity
 * uses for ground-truth — here we'd rather have a 5-char label than
 * the full email.
 */
function noteLabel(user: AdminUser): string {
  if (user.name && user.name.length > 0) return user.name;
  const isSyntheticSteam =
    user.email.startsWith('steam:') && user.email.endsWith('@hoard.internal');
  if (!isSyntheticSteam) {
    const at = user.email.indexOf('@');
    if (at > 0) return user.email.slice(0, at);
    return user.email;
  }
  // Synthetic-Steam without a name — fall back to displayIdentity,
  // which renders "Steam user — {steamId}".
  return user.displayIdentity;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
