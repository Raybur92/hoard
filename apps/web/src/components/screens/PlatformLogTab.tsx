import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api';
import { Btn } from '../primitives/Btn';
import { Marker } from '../primitives/Marker';
import type { PlatformLogEntry } from '@hoard/types';

/**
 * Terminal-style activity log for one platform (PR B of
 * `docs/SETTINGS_AUDIT_PLAN.md`).
 *
 * Renders entries as `[YYYY-MM-DD HH:MM:SS] LEVEL · message`, color-coded
 * by level (info=paper-dim, warn=amber, error=red). Cursor-paginated via
 * a `[load more]` button — simpler than infinite scroll and gives the
 * user explicit control over how much history they pull.
 *
 * Resets state on `code` change so navigating between PlatformDetail
 * pages doesn't bleed entries from one platform into another.
 */
export function PlatformLogTab({ code }: { code: string }) {
  const [entries, setEntries] = useState<PlatformLogEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable callback so the load-more button doesn't re-create the handler
  // every render and the initial-load effect's deps stay narrow.
  const loadMore = useCallback(async (resetCursor?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.platformLog(code, resetCursor);
      setEntries((prev) => resetCursor === undefined ? r.entries : [...prev, ...r.entries]);
      setCursor(r.nextCursor);
      setHasMore(r.nextCursor !== null);
    } catch {
      setError('Could not load activity. Try again.');
    } finally {
      setLoading(false);
    }
  }, [code]);

  // Reset + initial load on platform change.
  useEffect(() => {
    setEntries([]);
    setCursor(null);
    setHasMore(true);
    void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <div>
      <Marker>// activity log · {code.toUpperCase()}</Marker>

      {entries.length === 0 && !loading && !error && (
        <div className="t-faint" style={{ marginTop: 14, fontSize: "var(--text-2xs)", lineHeight: 1.6 }}>
          // no activity yet — events will appear here after your next sync.
        </div>
      )}

      {error && (
        <div className="t-mono" style={{ marginTop: 14, fontSize: "var(--text-2xs)", color: 'var(--red)' }} role="alert">
          {error}
        </div>
      )}

      {entries.length > 0 && (
        <pre
          className="ascii"
          style={{ marginTop: 12, fontSize: "var(--text-2xs)", lineHeight: 1.7, fontFamily: 'var(--mono)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
        >
          {entries.map((e) => (
            <div key={e.id} style={{ display: 'block' }}>
              <span style={{ color: 'var(--paper-faint)' }}>[{formatStamp(e.createdAt)}]</span>
              {' '}
              <span style={{ color: levelColor(e.level), display: 'inline-block', minWidth: 44 }}>{e.level}</span>
              {' · '}
              <span style={{ color: 'var(--paper-dim)' }}>{e.message}</span>
            </div>
          ))}
        </pre>
      )}

      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
        {hasMore && entries.length > 0 && (
          <Btn sm onClick={() => void loadMore(cursor)} disabled={loading}>
            {loading ? 'loading…' : 'load more'}
          </Btn>
        )}
        {!hasMore && entries.length > 0 && (
          <span className="t-faint" style={{ fontSize: "var(--text-3xs)" }}>// end of log</span>
        )}
      </div>
    </div>
  );
}

function formatStamp(iso: string): string {
  // [YYYY-MM-DD HH:MM:SS] — drop fractional seconds + Z. ISO format is
  // stable across server formatters, so a simple slice is enough.
  return iso.slice(0, 19).replace('T', ' ');
}

function levelColor(level: PlatformLogEntry['level']): string {
  if (level === 'error') return 'var(--red)';
  if (level === 'warn') return 'var(--amber)';
  return 'var(--green)';
}
