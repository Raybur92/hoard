import { useState } from 'react';
import { useAdminEvents } from '../../../hooks/useAdminEvents';
import type { UserEventWithUser } from '@hoard/types';
import { EmptyLine, ErrorBlock, LoadingLine, SectionHeader, relativeTime } from './shared';

// /admin/events — telemetry feed (TL1.4 of docs/TELEMETRY_PLAN.md).
// Cursor-paginated, immutable per TL-D10 — no mark-read, no delete.

export function AdminEvents() {
  const { items, nextCursor, loading, error, loadMore } = useAdminEvents();
  const [loadingMore, setLoadingMore] = useState(false);

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      await loadMore();
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div>
      {/* SectionHeader chip prop omitted — events are immutable per
          TL-D10, so no read-state count to surface. */}
      <SectionHeader label="events" count={items.length} />
      {loading && items.length === 0 ? (
        <LoadingLine />
      ) : error ? (
        <ErrorBlock message={error} />
      ) : items.length === 0 ? (
        <EmptyLine text="// no events yet" />
      ) : (
        <div>
          {items.map((entry) => <EventRow key={entry.id} entry={entry} />)}
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
    </div>
  );
}

function EventRow({ entry }: { entry: UserEventWithUser }) {
  const [expanded, setExpanded] = useState(false);

  const detailsPreview = (() => {
    if (!entry.details) return '—';
    const keys = Object.keys(entry.details);
    if (keys.length === 0) return '—';
    return keys
      .slice(0, 3)
      .map((k) => {
        const v = entry.details?.[k];
        const vs = typeof v === 'string' ? v : JSON.stringify(v);
        return `${k}=${(vs ?? '').slice(0, 24)}`;
      })
      .join(' · ');
  })();

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`Event ${entry.event} from ${entry.user.displayIdentity} — toggle raw details`}
        onClick={() => setExpanded((e) => !e)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((x) => !x);
          }
        }}
        style={{
          display: 'grid',
          gridTemplateColumns: '80px 1fr 120px 100px',
          alignItems: 'center',
          gap: 12,
          padding: '8px 0',
          borderBottom: '1px solid var(--rule)',
          cursor: 'pointer',
          fontSize: 'var(--text-xs)',
          fontFamily: 'var(--mono)',
        }}
      >
        <div className="t-faint">{relativeTime(entry.createdAt)}</div>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.user.displayIdentity}
        </div>
        <div className="t-mono" style={{ color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.event}
        </div>
        <div className="t-faint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {detailsPreview}
        </div>
      </div>
      {expanded && (
        <pre
          className="ascii"
          style={{
            margin: 0,
            padding: '10px 12px',
            background: 'var(--ink)',
            borderBottom: '1px solid var(--rule)',
            color: 'var(--paper)',
            fontFamily: 'var(--mono)',
            fontSize: 'var(--text-xs)',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.6,
            overflowX: 'auto',
          }}
        >
          {entry.details ? JSON.stringify(entry.details, null, 2) : '// no details'}
        </pre>
      )}
    </>
  );
}

export default AdminEvents;
