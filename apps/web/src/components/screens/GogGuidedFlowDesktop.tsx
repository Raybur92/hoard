import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { Marker } from '../primitives/Marker';
import { api } from '../../lib/api';

const GOG_STEPS = [
  { n: 1, t: 'open gog login',     d: 'Open the GOG sign-in page in a new tab. Hoard never sees your password — GOG redirects back with a one-time code.' },
  { n: 2, t: 'sign in to gog',     d: 'Authenticate with your normal GOG credentials. After sign-in, GOG redirects you to the Galaxy success page.' },
  { n: 3, t: 'copy the redirect',  d: 'Copy the FULL URL from your browser address bar. It looks like `…/on_login_success?code=XXXX…` — the code is what we need.' },
  { n: 4, t: 'paste into hoard',   d: "Paste the URL (or just the code) below. Hoard extracts the code automatically and exchanges it for an access token." },
  { n: 5, t: 'all set',             d: "We'll fetch your library. GOG community API doesn't expose playtime, so games land in Backlog by default." },
] as const;

/**
 * Extract the `code` query param from either a raw code or a full URL.
 * GOG users may paste either form — handle both gracefully.
 *
 * Returns the trimmed input as-is if no `code=` is present (assume raw code).
 */
function extractCode(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  // Look for ?code= or &code= and grab everything until the next & or end.
  const match = trimmed.match(/[?&]code=([^&\s#]+)/);
  if (match?.[1]) return match[1];
  return trimmed;
}

export function GogGuidedFlowDesktop() {
  useDocumentTitle("Connect GOG");
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [authUrlError, setAuthUrlError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Fetch the OAuth start URL once on mount. GOG_CLIENT_ID lives server-
  // side so we can't build it locally.
  useEffect(() => {
    void api.gogAuthUrl()
      .then((r) => setAuthUrl(r.url))
      .catch(() => setAuthUrlError('GOG OAuth is not configured on the server. Set GOG_CLIENT_ID + GOG_CLIENT_SECRET on the API and try again.'));
  }, []);

  const code = extractCode(input);
  const canAdvance =
    step < 4 ||
    (step === 4 && code.length >= 4) ||
    step === 5;

  async function handleNext(): Promise<void> {
    if (step === 4) {
      setSaving(true);
      setError('');
      try {
        await api.connectGog(code);
        setStep(5);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        setError(
          msg.startsWith('401')
            ? 'Not signed in to Hoard — open /login first, then come back here.'
            : msg.startsWith('400')
              ? 'GOG rejected the code. Codes are single-use and expire fast — start over from step 1.'
              : 'Server error saving credentials — check the API is running and try again.',
        );
      } finally {
        setSaving(false);
      }
      return;
    }
    if (step === 5) {
      navigate('/settings/platforms/gg');
      return;
    }
    setStep((s) => Math.min(s + 1, 5));
  }

  return (
    <div className="hoard-screen hoard-noise" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div style={{ width: 1080, maxWidth: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column' }}>

        {/* header */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <Marker>// connect / gog · step {step} of {GOG_STEPS.length}</Marker>
            <h1 className="t-display" style={{ fontSize: 30, marginTop: 8, color: 'var(--paper)', letterSpacing: '-0.01em', margin: 0, fontWeight: 'normal' }}>
              connect your gog library
            </h1>
            <div className="t-faint" style={{ fontSize: "var(--text-xs)", marginTop: 4 }}>
              gog uses oauth via galaxy's public credentials. you'll sign in on gog, then paste the redirect url back here.
            </div>
          </div>
          <button
            type="button"
            className="t-faint"
            aria-label="Cancel guided flow"
            onClick={() => navigate('/settings/platforms/gg')}
            style={{ fontSize: "var(--text-2xs)", display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', background: 'transparent', border: 'none', padding: 4, margin: -4, fontFamily: 'inherit', color: 'inherit' }}
          >
            <Icon name="x" size={11} /> cancel
          </button>
        </div>

        {/* step tracker */}
        <div className="panel" style={{ padding: '14px 18px', marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${GOG_STEPS.length}, 1fr)`, gap: 10 }}>
            {GOG_STEPS.map((s) => {
              const done = s.n < step, active = s.n === step;
              const c = done ? 'var(--green)' : active ? 'var(--paper)' : 'var(--paper-faint)';
              return (
                <div key={s.n} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ height: 2, background: done || active ? c : 'var(--rule)' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: "var(--text-3xs)", color: c, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    <span style={{ width: 14, height: 14, border: `1px solid ${c}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: done ? c : 'transparent', flexShrink: 0 }}>
                      {done ? <Icon name="check" size={9} style={{ color: 'var(--void)' }} /> : <span style={{ fontSize: "var(--text-2xs)" }}>{s.n}</span>}
                    </span>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.t}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* body */}
        <div className="panel" style={{ padding: 0, flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 0 }}>

          {/* LEFT — instruction */}
          <div style={{ padding: 28, borderRight: '1px solid var(--rule)', display: 'flex', flexDirection: 'column' }}>
            <Marker>// step {step} · {GOG_STEPS[step - 1]!.t}</Marker>
            <div className="t-display" style={{ fontSize: "var(--text-lg)", marginTop: 8, color: 'var(--paper)' }}>
              {GOG_STEPS[step - 1]!.t}
            </div>
            <div style={{ marginTop: 10, color: 'var(--paper-dim)', fontSize: "var(--text-sm)", lineHeight: 1.55 }}>
              {GOG_STEPS[step - 1]!.d}
            </div>

            {step === 1 && (
              <div style={{ marginTop: 18 }}>
                {authUrlError ? (
                  <div className="panel" style={{ padding: 12, background: 'var(--ink-2)', borderColor: 'var(--red)' }}>
                    <div style={{ fontSize: "var(--text-xs)", color: 'var(--red)' }}>{authUrlError}</div>
                  </div>
                ) : authUrl ? (
                  <a
                    href={authUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: "var(--text-xs)" }}
                  >
                    <Icon name="ext" size={11} /> open gog login →
                  </a>
                ) : (
                  <div className="t-faint" style={{ fontSize: "var(--text-xs)" }}>// loading auth url…</div>
                )}
              </div>
            )}

            {step === 3 && (
              <pre className="ascii" style={{
                marginTop: 14, padding: 14,
                background: 'var(--ink-2)', border: '1px solid var(--rule)',
                fontSize: "var(--text-xs)", lineHeight: 1.65,
                color: 'var(--paper-dim)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>
                {'https://embed.gog.com/on_login_success?'}
                <span style={{ color: 'var(--green)' }}>{'code='}</span>
                <span style={{ background: 'var(--green)', color: 'var(--void)', padding: '2px 4px', fontWeight: 500 }}>aBc123xYz…</span>
                {'&origin=client'}
              </pre>
            )}

            {step === 4 && (
              <div style={{ marginTop: 18 }}>
                <label htmlFor="gog-code-input-desktop" className="t-up t-faint" style={{ fontSize: "var(--text-3xs)" }}>// paste url or code</label>
                <input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  id="gog-code-input-desktop"
                  className="field"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="https://embed.gog.com/on_login_success?code=…  or just the code"
                  style={{
                    marginTop: 8, width: '100%', height: 38, fontSize: "var(--text-xs)",
                    fontFamily: 'var(--mono)',
                    background: 'var(--ink-2)', border: '1px solid var(--rule-bright)',
                    color: 'var(--paper)', padding: '0 12px', outline: 'none',
                  }}
                />
                <div className="t-faint" style={{ fontSize: "var(--text-3xs)", marginTop: 6 }}>
                  {code && code !== input.trim() ? `code extracted · ${code.length} chars` : `${code.length} chars · paste either the full url or just the code`}
                </div>
                {error && (
                  <div className="t-red" style={{ fontSize: "var(--text-2xs)", marginTop: 8, color: 'var(--red)' }}>{error}</div>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="panel" style={{ marginTop: 16, padding: 14, background: 'var(--ink-2)', borderColor: 'var(--green)', display: 'flex', gap: 10 }}>
                <Icon name="check" size={16} style={{ color: 'var(--green)', marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: "var(--text-sm)", color: 'var(--green)' }}>GOG connected!</div>
                  <div className="t-faint" style={{ fontSize: "var(--text-2xs)", marginTop: 4, lineHeight: 1.4 }}>
                    Library sync is starting. Note: GOG doesn't expose per-game playtime, so games land in Backlog by default — move them to Playing manually from the game detail page.
                  </div>
                </div>
              </div>
            )}

            {step < 5 && (
              <div className="panel" style={{ marginTop: 18, padding: 12, background: 'var(--ink-2)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <Icon name="shield" size={14} style={{ color: 'var(--green)', marginTop: 1 }} />
                <div style={{ fontSize: "var(--text-2xs)", color: 'var(--paper-dim)', lineHeight: 1.5 }}>
                  <div style={{ color: 'var(--paper)' }}>this code is single-use.</div>
                  hoard exchanges it for an access token + refresh token. credentials are encrypted at rest and never logged.
                </div>
              </div>
            )}

            <div style={{ flex: 1 }} />

            {/* nav */}
            <div style={{ marginTop: 24, display: 'flex', gap: 10, alignItems: 'center' }}>
              {step > 1 && step < 5 && (
                <Btn onClick={() => setStep((s) => s - 1)}>
                  <Icon name="back" size={11} /> step {step - 1}
                </Btn>
              )}
              <span style={{ flex: 1 }} />
              <Btn
                {...(step === 5 || canAdvance ? { variant: 'primary' as const } : {})}
                disabled={!canAdvance || saving}
                onClick={() => void handleNext()}
              >
                {saving ? 'exchanging…' : step === 5 ? 'done →' : step === 4 ? 'save & connect' : `next · step ${step + 1} →`}
              </Btn>
            </div>
          </div>

          {/* RIGHT — browser mock */}
          <div style={{ padding: 28, background: 'var(--ink-2)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="t-up t-faint" style={{ fontSize: "var(--text-3xs)" }}>// what you should see</div>

            <div style={{ border: '1px solid var(--rule-bright)', background: 'var(--void)', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {/* fake browser chrome */}
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--ink)' }}>
                <span style={{ display: 'inline-flex', gap: 4 }}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} style={{ width: 8, height: 8, background: 'var(--paper-faint)' }} />
                  ))}
                </span>
                <div className="field" style={{ flex: 1, height: 22, fontSize: "var(--text-3xs)", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span className="pre" style={{ color: 'var(--green)' }}>https://</span>
                  <span style={{ color: 'var(--paper-dim)' }}>embed.gog.com/on_login_success?</span>
                  <span style={{ background: 'var(--green)', color: 'var(--void)', padding: '0 3px' }}>code=aBc123…</span>
                </div>
                <Icon name="refresh" size={11} style={{ color: 'var(--paper-dim)' }} />
              </div>

              <div style={{ padding: 18, flex: 1, fontFamily: 'var(--mono)', fontSize: "var(--text-xs)", lineHeight: 1.7, color: 'var(--paper-dim)', overflow: 'auto' }}>
                <div style={{ color: 'var(--paper-dim)', fontSize: "var(--text-3xs)", marginBottom: 10 }}>// after sign-in, gog redirects here</div>
                <div style={{ color: 'var(--paper)', fontSize: "var(--text-sm)", marginBottom: 10 }}>You're logged in to GOG Galaxy.</div>
                <div className="t-faint" style={{ fontSize: "var(--text-2xs)", lineHeight: 1.55 }}>
                  The page looks empty — that's expected. The <span style={{ color: 'var(--green)' }}>code=</span> in the address bar is what hoard needs. Select the whole URL with ⌘L, copy it with ⌘C, and paste it on step 4.
                </div>
                <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--amber)', fontSize: "var(--text-2xs)" }}>
                  <Icon name="info" size={11} /> code expires in seconds · don't reuse a code, generate a fresh one if it fails
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, fontSize: "var(--text-3xs)", color: 'var(--paper-dim)', alignItems: 'center' }}>
              <Icon name="info" size={11} /> access tokens last 1h · hoard auto-refreshes on every sync
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default GogGuidedFlowDesktop;
