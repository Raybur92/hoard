import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useUser } from '../../contexts/UserContext';
import { Btn } from '../primitives/Btn';
import { Hr } from '../primitives/Hr';
import { Icon } from '../primitives/Icon';
import { api, RedeemInviteError } from '../../lib/api';
import { safeNext } from '../../lib/safeNext';

// Frontend-side regex matches the server's Zod validation. Format errors
// caught here never hit the API — they're a typo in the format ("HORD-…"
// or lowercase) and deserve a precise hint, not a generic rejection.
const CODE_REGEX = /^HOARD-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

const ERROR_COPY: Record<string, string> = {
  INVALID_FORMAT: "That doesn't look like a Hoard code. They look like HOARD-XXXX-XXXX.",
  CODE_NOT_FOUND: 'Code not recognized. Check for typos or ask Andrea for a new one.',
  CODE_ALREADY_REDEEMED: 'This code has already been redeemed.',
  RATE_LIMITED: 'Too many attempts. Try again in an hour.',
  UNKNOWN: 'Something went wrong. Try again.',
};

type InlinePanel = 'none' | 'code' | 'request';

export function WelcomeScreen() {
  useDocumentTitle('hoard · welcome');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, status, setUser, signOut } = useUser();

  const [code, setCode] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [inlinePanel, setInlinePanel] = useState<InlinePanel>('none');
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);

  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const messageRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (inlinePanel === 'code') codeInputRef.current?.focus();
    if (inlinePanel === 'request') messageRef.current?.focus();
  }, [inlinePanel]);

  // Loading state — matches RequireAuth/RequireActive's noise placeholder.
  if (status === 'loading') {
    return <div className="hoard-noise" style={{ minHeight: '100vh' }} />;
  }

  // ACTIVE users that land on /welcome (post-redemption flash, or typed
  // the URL directly) bounce back to wherever they were headed. Falls
  // back to root if no `next` or it fails the open-redirect allowlist.
  if (user && user.status === 'ACTIVE') {
    return <Navigate to={safeNext(params.get('next'))} replace />;
  }

  const requestSent = user?.hasRequestedAccess === true;

  async function handleRedeem(e: FormEvent) {
    e.preventDefault();
    setRedeemError(null);

    if (!CODE_REGEX.test(code)) {
      // Format-invalid is its own message — caught client-side without
      // an API call so the user gets the precise hint instantly.
      setRedeemError(ERROR_COPY['INVALID_FORMAT'] ?? null);
      return;
    }

    setRedeemBusy(true);
    try {
      const updatedUser = await api.redeemInvite(code);
      setUser(updatedUser);
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      if (err instanceof RedeemInviteError) {
        setRedeemError(ERROR_COPY[err.code] ?? ERROR_COPY['UNKNOWN'] ?? null);
      } else {
        setRedeemError(ERROR_COPY['UNKNOWN'] ?? null);
      }
    } finally {
      setRedeemBusy(false);
    }
  }

  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    setRequestBusy(true);
    try {
      await api.requestAccess(requestMessage.trim() || undefined);
      // Refresh user from context so hasRequestedAccess flips to true
      // and the panel switches to the request-sent state.
      if (user) setUser({ ...user, hasRequestedAccess: true });
      setInlinePanel('none');
      setRequestMessage('');
    } catch {
      // Request-access is idempotent; the realistic failure here is
      // network. The UI just stays on the form — no error banner needed.
    } finally {
      setRequestBusy(false);
    }
  }

  return (
    <div
      className="hoard-screen hoard-noise"
      style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* logo */}
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <h1 className="t-display" style={{ fontSize: 42, color: 'var(--paper)', letterSpacing: '0.04em', margin: 0, fontWeight: 'normal' }}>
            hoard
          </h1>
          <div className="t-mono t-faint" style={{ fontSize: 'var(--text-2xs)', marginTop: 4 }}>
            // closed beta · invite-only
          </div>
        </div>

        {/* primary panel */}
        <div className="panel" style={{ padding: 24 }}>
          <h2 className="t-mono" style={{ fontSize: 'var(--text-md)', margin: 0, color: 'var(--paper)', letterSpacing: '0.02em' }}>
            {requestSent ? '> request sent' : '> welcome to hoard'}
          </h2>
          <div style={{ margin: '12px 0 16px' }}><Hr kind="solid" /></div>

          {requestSent ? (
            <p className="t-mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--paper-dim)', lineHeight: 'var(--lh-relaxed)', margin: 0 }}>
              Andrea has been notified. You&rsquo;ll get a code at the address you signed in with.
              <br /><br />
              Got a code in the meantime? Paste it below.
            </p>
          ) : (
            <p className="t-mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--paper-dim)', lineHeight: 'var(--lh-relaxed)', margin: 0 }}>
              Hoard is in closed beta. Access is invite-only.
              <br /><br />
              If you have a code, paste it below.
              If you don&rsquo;t, request access and Andrea will get in touch.
            </p>
          )}

          {/* CTAs (default state only) */}
          {!requestSent && inlinePanel === 'none' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
              <Btn variant="primary" onClick={() => setInlinePanel('code')} style={{ flex: 1, minWidth: 160, height: 38, fontSize: 'var(--text-2xs)' }}>
                $ I have a code →
              </Btn>
              <Btn onClick={() => setInlinePanel('request')} style={{ flex: 1, minWidth: 160, height: 38, fontSize: 'var(--text-2xs)' }}>
                request access
              </Btn>
            </div>
          )}

          {/* code input — always visible in request-sent state, or after CTA click */}
          {(requestSent || inlinePanel === 'code') && (
            <form onSubmit={(e) => void handleRedeem(e)} style={{ marginTop: 20 }}>
              <label htmlFor="welcome-code" className="t-mono t-faint" style={{ fontSize: 'var(--text-3xs)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                // invite code
              </label>
              <input
                id="welcome-code"
                ref={codeInputRef}
                className="field"
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value.toUpperCase()); setRedeemError(null); }}
                placeholder="HOARD-XXXX-XXXX"
                autoComplete="off"
                spellCheck={false}
                style={fieldStyle}
                aria-invalid={redeemError !== null}
                aria-describedby={redeemError ? 'welcome-code-error' : undefined}
              />
              {redeemError !== null && (
                <div
                  id="welcome-code-error"
                  role="alert"
                  aria-live="assertive"
                  style={{
                    marginTop: 10, padding: '10px 14px',
                    border: '1px solid var(--red)', background: 'rgba(226,85,58,0.06)',
                    fontSize: 'var(--text-xs)', color: 'var(--red)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <Icon name="warn" size={13} /> {redeemError}
                </div>
              )}
              <Btn type="submit" variant="primary" disabled={redeemBusy || code.length === 0} style={{ width: '100%', height: 42, fontSize: 'var(--text-xs)', marginTop: 14 }}>
                {redeemBusy ? '// redeeming…' : '$ redeem →'}
              </Btn>
            </form>
          )}

          {/* request-access form (default state, expanded) */}
          {!requestSent && inlinePanel === 'request' && (
            <form onSubmit={(e) => void handleRequest(e)} style={{ marginTop: 20 }}>
              <label htmlFor="welcome-message" className="t-mono t-faint" style={{ fontSize: 'var(--text-3xs)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                // tell andrea who you are (optional)
              </label>
              <textarea
                id="welcome-message"
                ref={messageRef}
                className="field"
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value.slice(0, 500))}
                placeholder='e.g. "Hi, I&rsquo;m Marco — Luigi told me about Hoard."'
                rows={4}
                maxLength={500}
                style={{ ...fieldStyle, height: 'auto', padding: 12, resize: 'vertical' }}
              />
              <div className="t-faint" style={{ fontSize: 'var(--text-3xs)', marginTop: 4, textAlign: 'right' }}>
                {requestMessage.length}/500
              </div>
              <Btn type="submit" variant="primary" disabled={requestBusy} style={{ width: '100%', height: 42, fontSize: 'var(--text-xs)', marginTop: 8 }}>
                {requestBusy ? '// sending…' : '$ send request →'}
              </Btn>
            </form>
          )}
        </div>

        {/* sign out — always visible */}
        <div style={{ textAlign: 'center', marginTop: 28 }}>
          <button
            type="button"
            onClick={() => void signOut()}
            className="t-mono t-faint"
            style={{
              background: 'transparent', border: 'none',
              fontSize: 'var(--text-3xs)', cursor: 'pointer',
              textTransform: 'uppercase', letterSpacing: '0.12em',
              padding: 8,
            }}
          >
            [sign out]
          </button>
        </div>
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
