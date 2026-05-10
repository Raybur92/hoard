import { useEffect } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Icon } from '../primitives/Icon';

/**
 * Shared typed-confirm modal for destructive actions.
 *
 * Promoted from `SettingsDesktop.tsx` to a shared file in A-series
 * commit 3 (per A-D7 in `docs/ADMIN_POLISH_PLAN.md`). Three variants:
 *   - `'delete-account'` — user deletes their own account (HOARD keyword).
 *   - `'wipe-library'`   — user wipes their library (WIPE keyword).
 *   - `'delete-user'`    — admin deletes another user (typed displayIdentity).
 *
 * The first two carry exactly the copy that was inline in
 * SettingsDesktop pre-promotion — regression-guarded by the modal
 * test file. The third is new for A1.
 *
 * `details` (optional) — only consumed by the `'delete-user'` variant.
 * When provided, renders an extra `// X games · Y platforms` line
 * under the description so the admin sees concrete state before
 * confirming. Wishlists count is intentionally NOT in modal copy
 * (per A-D11) — passing it would silently be ignored. Future UX
 * iterations can extend the prop shape and the rendering branch.
 */
export interface ConfirmModalProps {
  variant: 'delete-account' | 'wipe-library' | 'delete-user';
  subject: string;
  confirmKeyword: string;
  confirmText: string;
  working: boolean;
  onTextChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  /** Optional cascade-aware counts for the `'delete-user'` variant. */
  details?: { games: number; platforms: number };
}

export function ConfirmModal({
  variant,
  subject,
  confirmKeyword,
  confirmText,
  working,
  onTextChange,
  onConfirm,
  onCancel,
  details,
}: ConfirmModalProps) {
  const confirmed = confirmText === confirmKeyword;
  const titleId = `${variant}-modal-title`;

  const headline = variant === 'delete-account'
    ? <>delete {subject}<br />and everything in it.</>
    : variant === 'wipe-library'
      ? <>wipe {subject}<br />but keep the account.</>
      : <>delete {subject}<br />· permanently.</>;

  const description = variant === 'delete-account'
    ? 'this will permanently erase your hoard. there is no recovery, no soft-delete window, no support ticket that brings it back.'
    : variant === 'wipe-library'
      ? 'deletes every tracked game, status, rating, and note. disconnects every connected platform. your wishlist, account, and preferences stay. you can re-sync from scratch afterwards.'
      // delete-user
      : 'deletes the account and every owned row — platforms, games, wishlist, sync logs. their invite code stays in the audit trail with the redeemer reference orphaned. cannot be undone.';

  const cancelLabel = variant === 'delete-account'
    ? 'cancel · keep my hoard'
    : variant === 'wipe-library'
      ? 'cancel · keep my library'
      : 'cancel · keep this user';

  const confirmLabel = variant === 'delete-account'
    ? (working ? 'deleting…' : 'delete forever')
    : variant === 'wipe-library'
      ? (working ? 'wiping…' : 'wipe library')
      : (working ? 'deleting…' : 'delete user');

  const trapRef = useFocusTrap<HTMLDivElement>(true);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onCancel(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // Per A-D11: wishlists count deliberately NOT in modal copy. Only
  // the delete-user variant renders the count line at all.
  const showCounts = variant === 'delete-user' && details !== undefined;

  return (
    <div ref={trapRef} role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <button type="button" aria-label="Close" onClick={onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(8,9,10,0.72)', border: 'none', cursor: 'default' }} />
      <div className="panel" style={{
        position: 'relative',
        width: 560,
        padding: 0,
        background: 'var(--ink)',
        borderColor: 'var(--red)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        zIndex: 1,
      }}>
        <div style={{
          height: 18,
          background: 'repeating-linear-gradient(135deg, var(--red) 0 8px, var(--ink) 8px 16px)',
          opacity: 0.6,
        }} />
        <div style={{ padding: '24px 28px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="warn" size={18} style={{ color: 'var(--red)' }} />
            <span className="t-up" style={{ fontSize: 'var(--text-2xs)', letterSpacing: '0.16em', color: 'var(--red)' }}>
              // destructive · permanent · cannot be undone
            </span>
          </div>
          <h2 id={titleId} className="t-display" style={{ fontSize: 26, marginTop: 14, color: 'var(--paper)', letterSpacing: '-0.01em', lineHeight: 1.1, margin: '14px 0 0', fontWeight: 'normal' }}>
            {headline}
          </h2>
          <div style={{ marginTop: 16, fontSize: 'var(--text-xs)', color: 'var(--paper-dim)', lineHeight: 1.55 }}>
            {description}
          </div>
          {showCounts && details && (
            <div
              className="t-mono t-faint"
              style={{ marginTop: 12, fontSize: 'var(--text-3xs)', letterSpacing: '0.04em' }}
            >
              // {details.games} {details.games === 1 ? 'game' : 'games'} ·{' '}
              {details.platforms} {details.platforms === 1 ? 'platform' : 'platforms'}
            </div>
          )}

          <div style={{ marginTop: 22 }}>
            {/*
              Hard-coded uppercase on the static "// TYPE … TO CONFIRM"
              wrapper instead of the t-up utility class — so the
              keyword span renders in its actual case (case-sensitive
              for the delete-user variant where the keyword is an
              email/displayIdentity). The legacy HOARD/WIPE keywords
              are already uppercase, so this is a no-op for them.
              Validation stays strict (exact match); only the
              displayed instruction is what-you-see-is-what-you-type.
            */}
            <div style={{ fontSize: 'var(--text-3xs)', letterSpacing: '0.12em', color: 'var(--paper-dim)' }}>
              // TYPE <span style={{ color: 'var(--red)' }}>{confirmKeyword}</span> TO CONFIRM
            </div>
            <input
              className="field"
              value={confirmText}
              // The legacy variants (HOARD/WIPE) are short fixed
              // keywords — uppercasing on input matches the placeholder
              // and the spec. The delete-user variant uses an email-or-
              // displayIdentity that is case-sensitive, so we only
              // uppercase for the legacy variants. Keeps backward
              // compat with the existing settings flow.
              onChange={(e) => onTextChange(
                variant === 'delete-user' ? e.target.value : e.target.value.toUpperCase(),
              )}
              style={{
                marginTop: 8,
                height: 38,
                fontSize: 'var(--text-base)',
                fontFamily: 'var(--mono)',
                letterSpacing: '0.18em',
                borderColor: 'var(--red)',
                color: 'var(--paper)',
                width: '100%',
                background: 'var(--ink-2)',
                border: '1px solid var(--red)',
                padding: '0 12px',
                outline: 'none',
              }}
              placeholder={`type ${confirmKeyword}`}
              maxLength={confirmKeyword.length}
            />
            {confirmed && (
              <div className="t-faint" style={{ fontSize: 'var(--text-3xs)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="check" size={10} style={{ color: 'var(--green)' }} /> matches · confirm unlocked
              </div>
            )}
          </div>

          <div style={{ marginTop: 22, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              className="btn"
              onClick={onCancel}
              style={{ flex: 1, height: 44, fontSize: 'var(--text-xs)', background: 'var(--paper)', color: 'var(--void)', border: '1px solid var(--paper)' }}
            >
              <Icon name="back" size={12} style={{ color: 'var(--void)' }} /> {cancelLabel}
            </button>
            <button
              className="btn"
              disabled={!confirmed || working}
              onClick={onConfirm}
              style={{ height: 38, fontSize: 'var(--text-2xs)', color: 'var(--red)', borderColor: 'var(--red)', background: 'transparent', opacity: (confirmed && !working) ? 1 : 0.4 }}
            >
              <Icon name="trash" size={11} /> {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
