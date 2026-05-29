// Shared primitives + helpers for the admin sub-routes. Extracted from
// the monolithic AdminScreen.tsx during the admin-IA redesign (2026-05-29).
// Each section page imports from here so the visual / behavioral
// vocabulary (SectionHeader, EmptyLine, ErrorBlock, relativeTime, etc.)
// stays consistent across routes.

import { Link } from 'react-router-dom';
import type { AdminUser } from '@hoard/types';

export type FilterKey = 'all' | 'active' | 'pending' | 'admin';
export type SortKey = 'joined' | 'status' | 'platforms';

export const FILTER_KEYS: FilterKey[] = ['all', 'active', 'pending', 'admin'];
export const SORT_CYCLE: SortKey[] = ['joined', 'status', 'platforms'];

// Shared grid template between UserHeaderRow and UserRow (kept here so
// both render identical column widths even though they live in
// AdminUsers.tsx). 5 cols per A-D10: identity (1fr) / status (70px) /
// joined (80px) / platforms+games (180px) / actions (80px). Width
// rationales preserved in the original AdminScreen.tsx commentary
// (CodeRow + UserRow comments still reference the eyeball-derived
// values).
export const USER_ROW_GRID = '1fr 70px 80px 180px 80px';

// "active" excludes admins per A-D9 (strict semantics — admins are
// their own bucket so the four chip counts partition the user list).
export function matchesFilter(u: AdminUser, f: FilterKey): boolean {
  if (f === 'all') return true;
  if (f === 'active') return u.status === 'ACTIVE' && !u.isAdmin;
  if (f === 'pending') return u.status === 'PENDING_INVITE';
  return u.isAdmin;
}

export function SectionHeader({
  label,
  count,
  chip,
}: { label: string; count: number; chip?: string | null }) {
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
        {chip && (
          <span
            style={{
              marginLeft: 12,
              color: 'var(--green)',
              textTransform: 'lowercase',
              letterSpacing: '0.08em',
            }}
          >
            · {chip}
          </span>
        )}
      </span>
      <div style={{ height: 1, background: 'var(--rule)', marginTop: 6 }} />
    </div>
  );
}

export function EmptyLine({ text }: { text: string }) {
  return (
    <div
      className="t-mono t-faint"
      style={{ fontSize: 'var(--text-xs)', padding: '12px 0 28px' }}
    >
      {text}
    </div>
  );
}

export function ErrorBlock({ message }: { message: string }) {
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

/** Page-level "loading…" indicator shown when a section is hydrating
 *  its hook data for the first time. */
export function LoadingLine() {
  return (
    <div
      className="t-mono t-faint"
      style={{ fontSize: 'var(--text-xs)', padding: '8px 0' }}
    >
      // loading…
    </div>
  );
}

export function MobileFallback() {
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

export function NotFoundView() {
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

/**
 * Compact label used in two places on the admin page:
 *   - The `[generate code for X]` button label on pending-request rows.
 *   - The pre-fill note that lands on the resulting invite code.
 *
 * Precedence: user.name → real-email local-part → displayIdentity
 * (covers synthetic-Steam users without a name set, which renders as
 * "Steam user — {steamId}").
 */
export function noteLabel(user: AdminUser): string {
  if (user.name && user.name.length > 0) return user.name;
  const isSyntheticSteam =
    user.email.startsWith('steam:') && user.email.endsWith('@hoard.internal');
  if (!isSyntheticSteam) {
    const at = user.email.indexOf('@');
    if (at > 0) return user.email.slice(0, at);
    return user.email;
  }
  return user.displayIdentity;
}

export function relativeTime(iso: string): string {
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
