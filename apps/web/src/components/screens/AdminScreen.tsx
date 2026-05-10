import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useUser } from '../../contexts/UserContext';
import { useAdminUsers } from '../../hooks/useAdminUsers';
import { useAdminInviteCodes } from '../../hooks/useAdminInviteCodes';
import { Btn } from '../primitives/Btn';
import { api } from '../../lib/api';
import * as cache from '../../lib/cache';
import { GenerateCodeModal } from './GenerateCodeModal';
import type { AdminUser, AdminInviteCode } from '@hoard/types';

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
  const { data: usersData, loading: usersLoading, error: usersError } = useAdminUsers();
  const { data: codesData, loading: codesLoading, error: codesError } = useAdminInviteCodes();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateNote, setGenerateNote] = useState<string>('');

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

  return (
    <div style={{ padding: '32px 36px 48px', maxWidth: 1100, margin: '0 auto' }}>
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
      {usersLoading && users.length === 0 ? (
        <div className="t-mono t-faint" style={{ fontSize: 'var(--text-xs)', padding: '8px 0' }}>// loading…</div>
      ) : usersError ? (
        <ErrorBlock message={usersError} />
      ) : users.length === 0 ? (
        <EmptyLine text="// no users" />
      ) : (
        <div style={{ marginBottom: 32 }}>
          {users.map((u) => <UserRow key={u.id} user={u} />)}
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
          fontSize: 'var(--text-2xs)',
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
  // Pre-fill the note with "for <displayIdentity>" so the admin
  // doesn't have to retype it per spec §7.2.
  const noteHint = `for ${user.displayIdentity}`;
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
        <Btn onClick={() => onGenerate(noteHint)}>generate code for {user.displayIdentity}</Btn>
      </div>
    </div>
  );
}

function UserRow({ user }: { user: AdminUser }) {
  // Terminal-style aligned row. Fields collapse cleanly at narrow desktop;
  // doesn't need full table semantics for v1.
  const statusColor =
    user.status === 'ACTIVE'
      ? (user.isAdmin ? 'var(--amber)' : 'var(--green)')
      : 'var(--paper-faint)';
  const statusLabel = user.isAdmin ? 'admin' : user.status === 'ACTIVE' ? 'active' : 'pending';
  const joined = new Date(user.createdAt).toISOString().slice(0, 10);
  const platforms = user.platforms.count > 0
    ? user.platforms.codes.join('·')
    : '—';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 80px 100px 100px',
        alignItems: 'baseline',
        padding: '6px 0',
        borderBottom: '1px dashed var(--rule)',
        fontSize: 'var(--text-xs)',
        fontFamily: 'var(--mono)',
        gap: 12,
      }}
    >
      <span style={{ color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {user.displayIdentity}
      </span>
      <span style={{ color: statusColor, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 'var(--text-3xs)' }}>
        {statusLabel}
      </span>
      <span className="t-faint" style={{ fontSize: 'var(--text-3xs)' }}>
        joined {joined}
      </span>
      <span className="t-faint" style={{ fontSize: 'var(--text-3xs)', textAlign: 'right' }}>
        {user.platforms.count} {user.platforms.count === 1 ? 'platform' : 'platforms'}
        {user.platforms.count > 0 ? ` · ${platforms}` : ''}
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
        gridTemplateColumns: '180px 1fr 180px 90px',
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
      <span className="t-faint" style={{ fontSize: 'var(--text-3xs)' }}>
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
      style={{ fontSize: 'var(--text-xs)', padding: '12px 0 28px', color: 'var(--paper-faint)' }}
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
