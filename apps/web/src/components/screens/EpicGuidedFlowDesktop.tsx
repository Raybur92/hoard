import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { Marker } from '../primitives/Marker';
import { api } from '../../lib/api';

const EPIC_STEPS = [
  { n: 1, t: 'open epic login',    d: 'Open the Epic Games sign-in page in a new tab. Hoard never sees your password — Epic returns a one-time authorization code on the redirect page.' },
  { n: 2, t: 'sign in to epic',    d: 'Authenticate with your normal Epic credentials. After sign-in, Epic redirects you to a plain page showing a JSON blob (NOT a normal Epic page).' },
  { n: 3, t: 'copy the json',      d: 'The PAGE BODY shows JSON with an `authorizationCode` field — the URL bar does NOT contain the code, just the input parameters. Select the whole JSON blob (Cmd+A → Cmd+C) or just the code value inside the quotes.' },
  { n: 4, t: 'paste into hoard',   d: 'Paste the JSON (or just the code) below. Hoard extracts the code automatically and exchanges it for an access token + refresh token.' },
  { n: 5, t: 'all set',             d: "We'll fetch your library. Epic doesn't expose playtime, so games land in Backlog by default." },
] as const;

/**
 * Extract the `authorizationCode` query param from either a raw code or
 * a full URL. Epic's redirect format is
 *   https://www.epicgames.com/id/api/redirect?authorizationCode=XXX
 * but the JSON page also shows it as a bare value the user might copy.
 */
function extractCode(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/authorizationCode["\s:=]*([A-Za-z0-9_-]+)/);
  if (match?.[1]) return match[1];
  // Could also be a JSON blob like {"authorizationCode":"abc"} — handled
  // by the regex above. Fallback: assume the user pasted just the code.
  return trimmed;
}

export function EpicGuidedFlowDesktop() {
  useDocumentTitle('Connect Epic Games');
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [authUrlError, setAuthUrlError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void api.epicAuthUrl()
      .then((r) => setAuthUrl(r.url))
      .catch(() => setAuthUrlError('Failed to load the Epic auth URL. Check the API is running.'));
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
        await api.connectEpic(code);
        setStep(5);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        setError(
          msg.startsWith('401')
            ? 'Not signed in to Hoard — open /login first, then come back here.'
            : msg.startsWith('400')
              ? 'Epic rejected the code. Codes are single-use and expire fast — start over from step 1.'
              : 'Server error saving credentials — check the API is running and try again.',
        );
      } finally {
        setSaving(false);
      }
      return;
    }
    if (step === 5) {
      navigate('/settings/platforms/ep');
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
            <Marker>// connect / epic · step {step} of {EPIC_STEPS.length}</Marker>
            <h1 className="t-display" style={{ fontSize: 30, marginTop: 8, color: 'var(--paper)', letterSpacing: '-0.01em', margin: 0, fontWeight: 'normal' }}>
              connect your epic library
            </h1>
            <div className="t-faint" style={{ fontSize: 'var(--text-xs)', marginTop: 4 }}>
              epic doesn&rsquo;t issue oauth credentials for aggregators. hoard uses the public fortnite-android client (same as heroic, legendary).
            </div>
          </div>
          <button
            type="button"
            className="t-faint"
            aria-label="Cancel guided flow"
            onClick={() => navigate('/settings/platforms/ep')}
            style={{ fontSize: 'var(--text-2xs)', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', background: 'transparent', border: 'none', padding: 4, margin: -4, fontFamily: 'inherit', color: 'inherit' }}
          >
            <Icon name="x" size={11} /> cancel
          </button>
        </div>

        {/* step tracker */}
        <div className="panel" style={{ padding: '14px 18px', marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${EPIC_STEPS.length}, 1fr)`, gap: 10 }}>
            {EPIC_STEPS.map((s) => {
              const done = s.n < step, active = s.n === step;
              const c = done ? 'var(--green)' : active ? 'var(--paper)' : 'var(--paper-faint)';
              return (
                <div key={s.n} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ height: 2, background: done || active ? c : 'var(--rule)' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-3xs)', color: c, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    <span style={{ width: 14, height: 14, border: `1px solid ${c}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: done ? c : 'transparent', flexShrink: 0 }}>
                      {done ? <Icon name="check" size={9} style={{ color: 'var(--void)' }} /> : <span style={{ fontSize: 'var(--text-2xs)' }}>{s.n}</span>}
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
            <Marker>// step {step} · {EPIC_STEPS[step - 1]!.t}</Marker>
            <div className="t-display" style={{ fontSize: 'var(--text-lg)', marginTop: 8, color: 'var(--paper)' }}>
              {EPIC_STEPS[step - 1]!.t}
            </div>
            <div style={{ marginTop: 10, color: 'var(--paper-dim)', fontSize: 'var(--text-sm)', lineHeight: 1.55 }}>
              {EPIC_STEPS[step - 1]!.d}
            </div>

            {step === 1 && (
              <div style={{ marginTop: 18 }}>
                {authUrlError ? (
                  <div className="panel" style={{ padding: 12, background: 'var(--ink-2)', borderColor: 'var(--red)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--red)' }}>{authUrlError}</div>
                  </div>
                ) : authUrl ? (
                  <a
                    href={authUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-xs)' }}
                  >
                    <Icon name="ext" size={11} /> open epic login →
                  </a>
                ) : (
                  <div className="t-faint" style={{ fontSize: 'var(--text-xs)' }}>// loading auth url…</div>
                )}
              </div>
            )}

            {step === 3 && (
              <pre className="ascii" style={{
                marginTop: 14, padding: 14,
                background: 'var(--ink-2)', border: '1px solid var(--rule)',
                fontSize: 'var(--text-xs)', lineHeight: 1.65,
                color: 'var(--paper-dim)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>
                {'{ "redirectUrl": "https://...", '}
                <span style={{ color: 'var(--green)' }}>{'"authorizationCode": '}</span>
                <span style={{ background: 'var(--green)', color: 'var(--void)', padding: '2px 4px', fontWeight: 500 }}>"aBc123xYz…"</span>
                {' }'}
              </pre>
            )}

            {step === 4 && (
              <div style={{ marginTop: 18 }}>
                <label htmlFor="epic-code-input-desktop" className="t-up t-faint" style={{ fontSize: 'var(--text-3xs)' }}>// paste json or code</label>
                <input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  id="epic-code-input-desktop"
                  className="field"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder='paste the JSON blob or just the authorizationCode value…'
                  style={{
                    marginTop: 8, width: '100%', height: 38, fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--mono)',
                    background: 'var(--ink-2)', border: '1px solid var(--rule-bright)',
                    color: 'var(--paper)', padding: '0 12px', outline: 'none',
                  }}
                />
                <div className="t-faint" style={{ fontSize: 'var(--text-3xs)', marginTop: 6 }}>
                  {code && code !== input.trim() ? `code extracted from json · ${code.length} chars` : `${code.length} chars · paste the json blob or just the code`}
                </div>
                {error && (
                  <div className="t-red" style={{ fontSize: 'var(--text-2xs)', marginTop: 8, color: 'var(--red)' }}>{error}</div>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="panel" style={{ marginTop: 16, padding: 14, background: 'var(--ink-2)', borderColor: 'var(--green)', display: 'flex', gap: 10 }}>
                <Icon name="check" size={16} style={{ color: 'var(--green)', marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--green)' }}>Epic connected!</div>
                  <div className="t-faint" style={{ fontSize: 'var(--text-2xs)', marginTop: 4, lineHeight: 1.4 }}>
                    Library sync is starting. Epic doesn&rsquo;t expose per-title playtime so games land in Backlog by default — move them to Playing manually from the game detail page.
                  </div>
                </div>
              </div>
            )}

            {step < 5 && (
              <div className="panel" style={{ marginTop: 18, padding: 12, background: 'var(--ink-2)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <Icon name="shield" size={14} style={{ color: 'var(--green)', marginTop: 1 }} />
                <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--paper-dim)', lineHeight: 1.5 }}>
                  <div style={{ color: 'var(--paper)' }}>this code is single-use.</div>
                  hoard exchanges it for a refresh token (28-day lifetime). credentials are encrypted at rest and never logged.
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
            <div className="t-up t-faint" style={{ fontSize: 'var(--text-3xs)' }}>// what you should see</div>

            <div style={{ border: '1px solid var(--rule-bright)', background: 'var(--void)', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {/* Fake browser chrome — note the URL bar does NOT contain the code,
                  only the input params. Common point of confusion. */}
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--ink)' }}>
                <span style={{ display: 'inline-flex', gap: 4 }}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} style={{ width: 8, height: 8, background: 'var(--paper-faint)' }} />
                  ))}
                </span>
                <div className="field" style={{ flex: 1, height: 22, fontSize: 'var(--text-3xs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span className="pre" style={{ color: 'var(--green)' }}>https://</span>
                  <span style={{ color: 'var(--paper-dim)' }}>www.epicgames.com/id/api/redirect?clientId=…&amp;responseType=code</span>
                </div>
                <Icon name="refresh" size={11} style={{ color: 'var(--paper-dim)' }} />
              </div>

              {/* Page body — JSON blob is what the user actually copies from. */}
              <div style={{ padding: 18, flex: 1, fontFamily: 'var(--mono)', fontSize: 'var(--text-xs)', lineHeight: 1.7, color: 'var(--paper-dim)', overflow: 'auto' }}>
                <div style={{ color: 'var(--paper-dim)', fontSize: 'var(--text-3xs)', marginBottom: 10 }}>// page body (raw JSON — no Epic chrome)</div>
                <pre className="ascii" style={{
                  padding: 10, background: 'var(--ink)', border: '1px solid var(--rule)',
                  fontSize: 'var(--text-3xs)', lineHeight: 1.5,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: '0 0 14px',
                }}>
                  {'{ "redirectUrl": "https://...",\n  "sid": "...",\n  '}
                  <span style={{ color: 'var(--green)' }}>{'"authorizationCode":'}</span>
                  {' '}
                  <span style={{ background: 'var(--green)', color: 'var(--void)', padding: '1px 4px' }}>"aBc123xYz…"</span>
                  {' }'}
                </pre>
                <div className="t-faint" style={{ fontSize: 'var(--text-2xs)', lineHeight: 1.55 }}>
                  Copy the <span style={{ color: 'var(--green)' }}>authorizationCode</span> value (or the whole JSON), then paste on step 4. The URL bar does NOT contain the code — only the page body does.
                </div>
                <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--amber)', fontSize: 'var(--text-2xs)' }}>
                  <Icon name="info" size={11} /> code expires fast · don&rsquo;t reuse, refresh the page if it fails
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, fontSize: 'var(--text-3xs)', color: 'var(--paper-dim)', alignItems: 'center' }}>
              <Icon name="info" size={11} /> access tokens last ~2h · refresh tokens 28d · hoard auto-refreshes
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default EpicGuidedFlowDesktop;
