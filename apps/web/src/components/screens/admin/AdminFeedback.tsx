import { useEffect, useState } from 'react';
import { useAdminFeedback } from '../../../hooks/useAdminFeedback';
import { ConfirmModal } from '../../modals/ConfirmModal';
import { api } from '../../../lib/api';
import type { FeedbackWithUser } from '@hoard/types';
import { EmptyLine, ErrorBlock, LoadingLine, SectionHeader, relativeTime } from './shared';

// /admin/feedback — full feedback log with mark-read toggle, [delete],
// and cursor-paginated [load more]. The delete affordance is new to the
// admin-IA redesign (2026-05-29) — closes the deferred gap from the
// F-series workstream where spam/noise rows had no triage exit.

export function AdminFeedback() {
  const { items, nextCursor, unreadCount, loading, error, loadMore } = useAdminFeedback();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<FeedbackWithUser | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [lastDeleted, setLastDeleted] = useState<string | null>(null);

  useEffect(() => {
    if (lastDeleted === null) return;
    const id = setTimeout(() => setLastDeleted(null), 1500);
    return () => clearTimeout(id);
  }, [lastDeleted]);

  async function handleToggleRead(id: string, read: boolean) {
    setBusyId(id);
    try {
      await api.admin.markFeedbackRead(id, read);
    } finally {
      setBusyId(null);
    }
  }

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      await loadMore();
    } finally {
      setLoadingMore(false);
    }
  }

  const openDelete = (entry: FeedbackWithUser) => {
    setDeleteTarget(entry);
    setDeleteConfirmText('');
  };

  const closeDelete = () => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteConfirmText('');
  };

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.admin.deleteFeedback(deleteTarget.id);
      setLastDeleted(deleteTarget.user.displayIdentity);
      setDeleteTarget(null);
      setDeleteConfirmText('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete feedback');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <SectionHeader
        label="feedback"
        count={items.length}
        chip={unreadCount > 0 ? `${unreadCount} unread` : null}
      />

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
          // deleted feedback from: {lastDeleted}
        </div>
      )}

      {loading && items.length === 0 ? (
        <LoadingLine />
      ) : error ? (
        <ErrorBlock message={error} />
      ) : items.length === 0 ? (
        <EmptyLine text="// no feedback yet" />
      ) : (
        <div>
          {items.map((entry) => (
            <FeedbackRow
              key={entry.id}
              entry={entry}
              working={busyId === entry.id}
              onToggleRead={handleToggleRead}
              onDelete={openDelete}
            />
          ))}
          {nextCursor !== null && (
            <button
              type="button"
              onClick={() => void handleLoadMore()}
              disabled={loadingMore}
              className="t-mono"
              style={{
                marginTop: 14,
                background: 'transparent',
                border: '1px solid var(--rule)',
                color: 'var(--paper-dim)',
                cursor: loadingMore ? 'default' : 'pointer',
                fontSize: 'var(--text-xs)',
                padding: '6px 14px',
                letterSpacing: '0.12em',
              }}
            >
              {loadingMore ? '[loading…]' : '[load more]'}
            </button>
          )}
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          variant="delete-feedback"
          subject={deleteTarget.user.displayIdentity}
          confirmKeyword="DELETE"
          confirmText={deleteConfirmText}
          working={deleting}
          onTextChange={setDeleteConfirmText}
          onConfirm={() => void handleConfirmDelete()}
          onCancel={closeDelete}
        />
      )}
    </div>
  );
}

function FeedbackRow({
  entry,
  working,
  onToggleRead,
  onDelete,
}: {
  entry: FeedbackWithUser;
  working: boolean;
  onToggleRead: (id: string, read: boolean) => Promise<void>;
  onDelete: (entry: FeedbackWithUser) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`Feedback from ${entry.user.displayIdentity} — toggle full message`}
        onClick={() => setExpanded((e) => !e)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((x) => !x);
          }
        }}
        style={{
          // identity (1fr) / viewport (180) / [mark] (110) / [delete] (90)
          display: 'grid',
          gridTemplateColumns: '80px 1fr 180px 110px 90px',
          alignItems: 'center',
          padding: '10px 0',
          borderBottom: '1px solid var(--rule)',
          opacity: entry.read ? 0.6 : 1,
          cursor: 'pointer',
          fontSize: 'var(--text-xs)',
          fontFamily: 'var(--mono)',
        }}
      >
        <div className="t-faint">{relativeTime(entry.createdAt)}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {!entry.read && (
            <span
              aria-hidden="true"
              className="status-sigil"
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--green)',
                flexShrink: 0,
              }}
            />
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entry.user.displayIdentity}
          </span>
        </div>
        <div className="t-faint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.viewport ?? '—'}
        </div>
        <div style={{ textAlign: 'right' }}>
          <button
            type="button"
            disabled={working}
            onClick={(e) => {
              e.stopPropagation();
              void onToggleRead(entry.id, !entry.read);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
            }}
            className="t-mono"
            style={{
              background: 'transparent',
              border: '1px solid var(--rule)',
              color: 'var(--paper-dim)',
              cursor: working ? 'default' : 'pointer',
              fontSize: 'var(--text-3xs)',
              padding: '4px 8px',
              letterSpacing: '0.08em',
            }}
          >
            {working ? '…' : entry.read ? '[mark unread]' : '[mark read]'}
          </button>
        </div>
        <div style={{ textAlign: 'right' }}>
          <button
            type="button"
            aria-label={`Delete feedback from ${entry.user.displayIdentity}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(entry);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
            }}
            className="t-mono"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--red)',
              cursor: 'pointer',
              fontSize: 'var(--text-3xs)',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              padding: 4,
            }}
          >
            [delete]
          </button>
        </div>
      </div>
      {expanded && (
        <div
          style={{
            padding: '10px 12px 14px',
            background: 'var(--ink)',
            borderBottom: '1px solid var(--rule)',
            color: 'var(--paper)',
            fontFamily: 'var(--mono)',
            fontSize: 'var(--text-xs)',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.6,
            opacity: entry.read ? 0.7 : 1,
          }}
        >
          {entry.message}
        </div>
      )}
    </>
  );
}

export default AdminFeedback;
