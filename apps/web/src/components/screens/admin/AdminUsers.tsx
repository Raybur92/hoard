import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAdminUsers } from '../../../hooks/useAdminUsers';
import { useUser } from '../../../contexts/UserContext';
import { Chip } from '../../primitives/Chip';
import { ConfirmModal } from '../../modals/ConfirmModal';
import { api } from '../../../lib/api';
import type { AdminUser } from '@hoard/types';
import {
  EmptyLine,
  ErrorBlock,
  FILTER_KEYS,
  LoadingLine,
  SectionHeader,
  SORT_CYCLE,
  USER_ROW_GRID,
  matchesFilter,
  type FilterKey,
  type SortKey,
} from './shared';

// /admin/users — full list w/ filter chips + search + sort cycle +
// per-row delete affordance. URL state preserved (?filter=&sort=&q=)
// so /admin/users?filter=pending is a shareable link.

export function AdminUsers() {
  const { data, loading, error } = useAdminUsers();
  const { user: currentUser } = useUser();
  const users = useMemo(() => data?.users ?? [], [data]);

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

  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [lastDeleted, setLastDeleted] = useState<string | null>(null);

  useEffect(() => {
    if (lastDeleted === null) return;
    const id = setTimeout(() => setLastDeleted(null), 1500);
    return () => clearTimeout(id);
  }, [lastDeleted]);

  const filterCounts = useMemo(
    () => ({
      all: users.length,
      active: users.filter((u) => matchesFilter(u, 'active')).length,
      pending: users.filter((u) => matchesFilter(u, 'pending')).length,
      admin: users.filter((u) => matchesFilter(u, 'admin')).length,
    }),
    [users],
  );

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

  const openDelete = (u: AdminUser) => {
    setDeleteTarget(u);
    setDeleteConfirmText('');
  };

  const closeDelete = () => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteConfirmText('');
  };

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    if (currentUser && currentUser.id === deleteTarget.id) {
      setDeleteTarget(null);
      setDeleteConfirmText('');
      return;
    }
    setDeleting(true);
    try {
      await api.admin.deleteUser(deleteTarget.id);
      setLastDeleted(deleteTarget.displayIdentity);
      setDeleteTarget(null);
      setDeleteConfirmText('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <SectionHeader label="all users" count={users.length} />

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

      {loading && users.length === 0 ? (
        <LoadingLine />
      ) : error ? (
        <ErrorBlock message={error} />
      ) : users.length === 0 ? (
        <EmptyLine text="// no users" />
      ) : visibleUsers.length === 0 ? (
        <EmptyLine text={q ? `// no users match "${q}"` : '// no users in this filter'} />
      ) : (
        <div>
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
  );
}

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
  const showBoth =
    user.name !== null &&
    user.name.length > 0 &&
    !user.email.startsWith('steam:');
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

  const hasAnyData = user.platforms.count > 0 || user.gamesCount > 0;
  const platformsLabel = hasAnyData
    ? `${user.platforms.count} ${user.platforms.count === 1 ? 'platform' : 'platforms'} · ${user.gamesCount} ${user.gamesCount === 1 ? 'game' : 'games'}`
    : '—';

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

export default AdminUsers;
