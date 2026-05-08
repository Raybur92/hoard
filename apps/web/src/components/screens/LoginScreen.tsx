import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useUser } from '../../contexts/UserContext';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { Hr } from '../primitives/Hr';
import { api } from '../../lib/api';
import { safeNext } from '../../lib/safeNext';

type Mode = 'login' | 'register';

const API_BASE = (import.meta.env['VITE_API_URL'] as string | undefined) ?? '';

export function LoginScreen() {
  useDocumentTitle("Sign in");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { setUser } = useUser();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Show error from OAuth redirects
  useEffect(() => {
    const err = params.get('error');
    if (err === 'google_failed') setError('Google sign-in failed. Please try again.');
    if (err === 'steam_failed')  setError('Steam sign-in failed. Please try again.');
  }, [params]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Capture the response so we can push the user into UserContext
      // BEFORE navigating. UserProvider only fetches /api/auth/me at
      // mount; without setUser here, the SPA-internal navigate would
      // land on a route gated by RequireAuth, which still sees
      // status='unauthed' from the pre-cookie initial fetch and bounces
      // straight back to /login. OAuth callbacks dodge this because
      // they're full-page redirects (UserProvider remounts with the
      // cookie present); the local form path can't.
      const response = mode === 'login'
        ? await api.login({ email, password })
        : await api.register({ email, password, ...(name ? { name } : {}) });
      setUser(response.user);

      // Status-aware navigation.
      //   - ACTIVE  → safeNext-validated `next` or `/`
      //   - PENDING → /welcome, with `next` preserved so post-redemption
      //               the welcome screen returns the user to where they
      //               were trying to go. If no `next`, just /welcome.
      const next = safeNext(params.get('next'));
      const isActive = response.user.status === 'ACTIVE';
      const target = isActive
        ? next
        : (next === '/' ? '/welcome' : `/welcome?next=${encodeURIComponent(next)}`);
      // replace: true so the back button doesn't return to /login.
      navigate(target, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="hoard-screen hoard-noise"
      style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>

        {/* logo */}
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <h1 className="t-display" style={{ fontSize: 42, color: 'var(--paper)', letterSpacing: '0.04em', margin: 0, fontWeight: 'normal' }}>
            hoard
          </h1>
          <div className="t-mono t-faint" style={{ fontSize: "var(--text-2xs)", marginTop: 4 }}>
            // your games. all of them.
          </div>
        </div>

        {/* tab switcher */}
        <div role="tablist" aria-label="Authentication mode" style={{ display: 'flex', marginBottom: 20, borderBottom: '1px solid var(--rule)' }}>
          {(['login', 'register'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => { setMode(m); setError(''); }}
              style={{
                padding: '8px 0', marginRight: 20,
                fontSize: "var(--text-2xs)", fontFamily: 'var(--mono)',
                textTransform: 'uppercase', letterSpacing: '0.12em',
                color: mode === m ? 'var(--paper)' : 'var(--paper-dim)',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${mode === m ? 'var(--green)' : 'transparent'}`,
                marginBottom: -1,
                cursor: 'pointer',
              }}
            >
              {m === 'login' ? 'sign in' : 'register'}
            </button>
          ))}
        </div>

        {/* form */}
        <form onSubmit={(e) => void handleSubmit(e)}>
          {mode === 'register' && (
            <div style={{ marginBottom: 12 }}>
              <label htmlFor="login-name" className="t-mono t-faint" style={{ fontSize: "var(--text-3xs)", textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                // display name (optional)
              </label>
              <input
                id="login-name"
                className="field"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="andrea h."
                style={fieldStyle}
                autoComplete="name"
              />
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <label htmlFor="login-email" className="t-mono t-faint" style={{ fontSize: "var(--text-3xs)", textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              // email
            </label>
            <input
              id="login-email"
              className="field"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="andrea@example.com"
              required
              style={fieldStyle}
              autoComplete="email"
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label htmlFor="login-password" className="t-mono t-faint" style={{ fontSize: "var(--text-3xs)", textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              // password {mode === 'register' && <span className="t-ghost">(min 8 chars)</span>}
            </label>
            <input
              id="login-password"
              className="field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={mode === 'register' ? 8 : 1}
              style={fieldStyle}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && (
            <div role="alert" aria-live="assertive" style={{
              marginBottom: 14, padding: '10px 14px',
              border: '1px solid var(--red)', background: 'rgba(226,85,58,0.06)',
              fontSize: "var(--text-xs)", color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Icon name="warn" size={13} /> {error}
            </div>
          )}

          <Btn type="submit" variant="primary" disabled={loading} style={{ width: '100%', height: 42, fontSize: "var(--text-xs)" }}>
            {loading
              ? '// loading…'
              : mode === 'login'
                ? '$ sign in →'
                : '$ create account →'}
          </Btn>
        </form>

        {/* divider */}
        <div style={{ margin: '20px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}><Hr kind="dot" /></div>
          <span className="t-mono t-ghost" style={{ fontSize: "var(--text-3xs)" }}>or</span>
          <div style={{ flex: 1 }}><Hr kind="dot" /></div>
        </div>

        {/* OAuth buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <a
            href={`${API_BASE}/api/auth/google`}
            style={{ textDecoration: 'none' }}
          >
            <Btn style={{ width: '100%', height: 38, fontSize: "var(--text-2xs)", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Icon name="user" size={12} /> continue with google
            </Btn>
          </a>
          <a
            href={`${API_BASE}/api/auth/steam`}
            style={{ textDecoration: 'none' }}
          >
            <Btn style={{ width: '100%', height: 38, fontSize: "var(--text-2xs)", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Icon name="play" size={12} /> continue with steam
            </Btn>
          </a>
        </div>

        {/* footer */}
        <div className="t-faint" style={{ fontSize: "var(--text-3xs)", textAlign: 'center', marginTop: 28, lineHeight: 1.5 }}>
          hoard is a personal tool — your data stays yours.
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
  fontSize: "var(--text-xs)",
  fontFamily: 'var(--mono)',
  background: 'var(--ink-2)',
  border: '1px solid var(--rule-bright)',
  color: 'var(--paper)',
  padding: '0 12px',
  outline: 'none',
};
