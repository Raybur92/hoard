import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Btn } from '../primitives/Btn';
import { Icon } from '../primitives/Icon';
import { api } from '../../lib/api';
import type { AdminInviteCode } from '@hoard/types';

export interface GenerateCodeModalProps {
  /** Optional pre-filled note (e.g. "for marco" when launched from a
   *  pending-request row's prefilled-note button per spec §7.2). */
  initialNote?: string;
  onClose: () => void;
}

/**
 * Inline modal: optional note input → POST /api/admin/invite-codes →
 * copyable callout with the new code. Two states:
 *   1. 'prompt' — note input + [generate] button
 *   2. 'created' — green-tinted callout with the code + [copy] + [done]
 *
 * If the user closes the modal AFTER the code has been minted but BEFORE
 * copying, the code is in the DB and lives in the codes section (the
 * SWR cache invalidation in api.admin.createInviteCode dropped the
 * stale list). They can copy it from there. Acceptable failure mode —
 * modal-close mid-flow doesn't lose data, just the convenience of the
 * copy button.
 */
export function GenerateCodeModal({ initialNote = '', onClose }: GenerateCodeModalProps) {
  const [note, setNote] = useState(initialNote);
  const [created, setCreated] = useState<AdminInviteCode | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  useEffect(() => {
    inputRef.current?.focus();
    if (initialNote) inputRef.current?.select();
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, initialNote]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const code = await api.admin.createInviteCode(note.trim() || undefined);
      setCreated(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate code');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.code);
      setCopied(true);
      // Auto-dismiss the // copied indicator after 1.5s. Doesn't reset
      // any other state — the callout stays visible until [done].
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // navigator.clipboard can fail on insecure origins or denied
      // permissions. Fall back to a textarea select-all so the admin
      // can manually Cmd-C. Realistically this never fires in
      // production (HTTPS + user-initiated click).
      setError('Could not copy automatically — code is shown above; select and Cmd-C.');
    }
  }

  return (
    <div
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="generate-code-title"
      style={{ position: 'fixed', inset: 0, background: 'rgba(7,9,10,0.88)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <button
        type="button"
        aria-label="Close generate code dialog"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'transparent', border: 'none', cursor: 'default' }}
      />
      <div className="panel raised" style={{ position: 'relative', width: 'min(480px, 92vw)', padding: 24 }}>
        <h2
          id="generate-code-title"
          className="t-mono"
          style={{ fontSize: 'var(--text-md)', margin: 0, color: 'var(--paper)', letterSpacing: '0.02em' }}
        >
          {created ? '> new code generated' : '> generate invite code'}
        </h2>

        <div style={{ margin: '12px 0 16px', height: 1, background: 'var(--rule)' }} />

        {!created && (
          <form onSubmit={(e) => void handleGenerate(e)}>
            <label
              htmlFor="generate-code-note"
              className="t-mono t-faint"
              style={{ fontSize: 'var(--text-3xs)', textTransform: 'uppercase', letterSpacing: '0.12em' }}
            >
              // note (optional, max 100 chars)
            </label>
            <input
              id="generate-code-note"
              ref={inputRef}
              className="field"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 100))}
              placeholder='e.g. "for marco" or "spare"'
              maxLength={100}
              style={fieldStyle}
            />
            {error !== '' && (
              <div role="alert" aria-live="assertive" style={errorBoxStyle}>
                <Icon name="warn" size={13} /> {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
              <Btn type="button" onClick={onClose} disabled={submitting}>cancel</Btn>
              <Btn type="submit" variant="primary" disabled={submitting}>
                {submitting ? '// generating…' : '$ generate →'}
              </Btn>
            </div>
          </form>
        )}

        {created && (
          <div>
            <div
              className="panel"
              style={{
                padding: '14px 16px',
                background: 'rgba(95,194,106,0.06)',
                border: '1px solid var(--green)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <code
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 'var(--text-md)',
                  color: 'var(--paper)',
                  letterSpacing: '0.04em',
                  userSelect: 'all',
                }}
              >
                {created.code}
              </code>
              <Btn
                type="button"
                onClick={() => void handleCopy()}
                ariaLabel="Copy code to clipboard"
                style={{ flexShrink: 0 }}
              >
                {copied ? '// copied' : '[copy]'}
              </Btn>
            </div>
            {created.note && (
              <div
                className="t-mono t-faint"
                style={{ fontSize: 'var(--text-3xs)', marginTop: 8 }}
              >
                // note: {created.note}
              </div>
            )}
            <p
              className="t-mono t-faint"
              style={{ fontSize: 'var(--text-xs)', color: 'var(--paper-dim)', marginTop: 16, lineHeight: 'var(--lh-relaxed)' }}
            >
              Send this to your friend. They&rsquo;ll paste it after signing in.
            </p>
            {error !== '' && (
              <div role="alert" aria-live="polite" style={errorBoxStyle}>
                <Icon name="warn" size={13} /> {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
              <Btn type="button" variant="primary" onClick={onClose}>done</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 6,
  height: 36,
  fontSize: 'var(--text-xs)',
  fontFamily: 'var(--mono)',
  background: 'var(--ink-2)',
  border: '1px solid var(--rule-bright)',
  color: 'var(--paper)',
  padding: '0 12px',
  outline: 'none',
};

const errorBoxStyle: React.CSSProperties = {
  marginTop: 10,
  padding: '10px 14px',
  border: '1px solid var(--red)',
  background: 'rgba(226,85,58,0.06)',
  fontSize: 'var(--text-xs)',
  color: 'var(--red)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};
