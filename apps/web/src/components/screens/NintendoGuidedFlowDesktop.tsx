import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { Marker } from '../primitives/Marker';
import { api } from '../../lib/api';

// M3 — Nintendo Switch guided flow (Parental Controls API).
//
// 7 steps:
//   1. explainer — why Nintendo is fiddly (no public library API; we use
//      the Parental Controls "Moon" API which surfaces every owned game
//      via the console-pairing relationship).
//   2. install the Parental Controls app on your phone.
//   3. in the app, pair your Switch with your own Nintendo Account as the
//      PARENT (you act as your own guardian).
//   4. open the Nintendo sign-in URL (or scan QR with your phone).
//   5. sign in. Nintendo redirects to `npf...://auth#session_token_code=...`
//      — your browser can't navigate to that scheme so the page errors out.
//      Copy the FULL URL from the address bar.
//   6. paste here. Hoard extracts the code automatically.
//   7. all set — library + per-title playtime syncing.
//
// Skip-ahead link on steps 2 and 3: users who already have Parental
// Controls paired (Andrea, future returning users) skip straight to
// step 4. The auth URL + verifier are fetched lazily when step 4 is
// first reached.
const NT_STEPS = [
  { n: 1, t: 'how this works',     d: "Nintendo doesn't publish a games API. We use Parental Controls — same data, one-time setup. You'll act as your own guardian." },
  { n: 2, t: 'install the app',    d: 'Install "Nintendo Switch Parental Controls" on your phone from the App Store or Google Play. The app is what produces the data Hoard reads.' },
  { n: 3, t: 'pair your switch',   d: 'In the Parental Controls app, register your Switch with your own Nintendo Account as the parent. You sign in as both parent + child (Nintendo allows this).' },
  { n: 4, t: 'open nintendo sign-in', d: 'Open the link below (or scan the QR with your phone). Sign in with the Nintendo Account you paired in step 3.' },
  { n: 5, t: 'copy the redirect',  d: 'After sign-in your browser shows an error like "This site can’t be reached" — that’s expected. The URL bar still has the code we need. Copy the FULL address bar URL.' },
  { n: 6, t: 'paste into hoard',   d: 'Paste the URL below. Hoard extracts the session_token_code, exchanges it for a long-lived session token, and starts the first sync.' },
  { n: 7, t: 'all set',            d: "Library + per-title playtime are syncing. Newly-paired consoles take ~24h before Nintendo's first daily summary lands." },
] as const;

export function NintendoGuidedFlowDesktop() {
  useDocumentTitle('Connect Nintendo Switch');
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [verifier, setVerifier] = useState<string | null>(null);
  const [authUrlError, setAuthUrlError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fetchedRef = useRef(false);

  // Fetch the auth URL + verifier lazily on the first reach of step 4 so
  // the PKCE pair doesn't sit around for the whole session if the user
  // gets stuck on steps 1-3.
  useEffect(() => {
    if (step < 4 || fetchedRef.current) return;
    fetchedRef.current = true;
    void api.nintendoAuthUrl()
      .then((r) => { setAuthUrl(r.url); setVerifier(r.verifier); })
      .catch(() => setAuthUrlError('Failed to load the Nintendo auth URL. Check the API is running.'));
  }, [step]);

  useEffect(() => {
    if (!authUrl) return;
    void QRCode.toDataURL(authUrl, { width: 220, margin: 1, color: { dark: '#ece8de', light: '#0d101200' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [authUrl]);

  const trimmed = input.trim();
  const canAdvance =
    step < 6 ||
    (step === 6 && trimmed.length >= 20 && verifier !== null) ||
    step === 7;

  async function handleNext(): Promise<void> {
    if (step === 6) {
      if (!verifier) {
        setError('Auth URL not loaded. Go back to step 4 and try again.');
        return;
      }
      setSaving(true);
      setError('');
      try {
        // Server accepts either the full redirect URL or the bare code.
        // We send `redirectUrl` always since the user typically pastes
        // the full address-bar URL — extractSessionTokenCode handles
        // both shapes on the server.
        await api.connectNintendo({ redirectUrl: trimmed, verifier });
        setStep(7);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        setError(
          msg.startsWith('401')
            ? 'Not signed in to Hoard — open /login first, then come back here.'
            : msg.startsWith('400')
              ? "Nintendo rejected the code. Codes are single-use and expire fast — go back to step 4 and start over."
              : 'Server error saving credentials — check the API is running and try again.',
        );
      } finally {
        setSaving(false);
      }
      return;
    }
    if (step === 7) {
      navigate('/settings/platforms/nt');
      return;
    }
    setStep((s) => Math.min(s + 1, 7));
  }

  const stepData = useMemo(() => NT_STEPS[step - 1]!, [step]);

  return (
    <div className="hoard-screen hoard-noise" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div style={{ width: 1080, maxWidth: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column' }}>

        {/* header */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <Marker>// connect / nintendo · step {step} of {NT_STEPS.length}</Marker>
            <h1 className="t-display" style={{ fontSize: 30, marginTop: 8, color: 'var(--paper)', letterSpacing: '-0.01em', margin: 0, fontWeight: 'normal' }}>
              connect your switch library
            </h1>
            <div className="t-faint" style={{ fontSize: 'var(--text-xs)', marginTop: 4 }}>
              nintendo has no public api. we read your library via parental controls — same data, one-time setup.
            </div>
          </div>
          <button
            type="button"
            className="t-faint"
            aria-label="Cancel guided flow"
            onClick={() => navigate('/settings/platforms/nt')}
            style={{ fontSize: 'var(--text-2xs)', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', background: 'transparent', border: 'none', padding: 4, margin: -4, fontFamily: 'inherit', color: 'inherit' }}
          >
            <Icon name="x" size={11} /> cancel
          </button>
        </div>

        {/* step tracker */}
        <div className="panel" style={{ padding: '14px 18px', marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${NT_STEPS.length}, 1fr)`, gap: 10 }}>
            {NT_STEPS.map((s) => {
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
            <Marker>// step {step} · {stepData.t}</Marker>
            <div className="t-display" style={{ fontSize: 'var(--text-lg)', marginTop: 8, color: 'var(--paper)' }}>
              {stepData.t}
            </div>
            <div style={{ marginTop: 10, color: 'var(--paper-dim)', fontSize: 'var(--text-sm)', lineHeight: 1.55 }}>
              {stepData.d}
            </div>

            {(step === 2 || step === 3) && (
              <div style={{ marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="t-amber"
                  style={{ background: 'transparent', border: 'none', padding: 0, fontFamily: 'var(--mono)', fontSize: 'var(--text-xs)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, color: 'var(--amber)' }}
                >
                  // skip ahead · my switch is already paired →
                </button>
              </div>
            )}

            {step === 2 && (
              <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <a href="https://apps.apple.com/app/nintendo-switch-parental-controls/id1190074407" target="_blank" rel="noreferrer" className="t-mono" style={{ color: 'var(--paper)', fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="ext" size={11} /> App Store · iOS
                </a>
                <a href="https://play.google.com/store/apps/details?id=com.nintendo.znma" target="_blank" rel="noreferrer" className="t-mono" style={{ color: 'var(--paper)', fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="ext" size={11} /> Google Play · Android
                </a>
              </div>
            )}

            {step === 4 && (
              <div style={{ marginTop: 18 }}>
                {authUrlError ? (
                  <div className="panel" style={{ padding: 12, background: 'var(--ink-2)', borderColor: 'var(--red)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--red)' }}>{authUrlError}</div>
                  </div>
                ) : authUrl ? (
                  <>
                    <a
                      href={authUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn primary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-xs)' }}
                    >
                      <Icon name="ext" size={11} /> open nintendo sign-in →
                    </a>
                    <div className="t-faint" style={{ fontSize: 'var(--text-3xs)', marginTop: 8, lineHeight: 1.5 }}>
                      heads-up: after sign-in your browser will show a page-not-found error. that&rsquo;s expected — the address bar still holds the code we need.
                    </div>
                  </>
                ) : (
                  <div className="t-faint" style={{ fontSize: 'var(--text-xs)' }}>// loading auth url…</div>
                )}
              </div>
            )}

            {step === 5 && (
              <pre className="ascii" style={{
                marginTop: 14, padding: 14,
                background: 'var(--ink-2)', border: '1px solid var(--rule)',
                fontSize: 'var(--text-xs)', lineHeight: 1.65,
                color: 'var(--paper-dim)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>
                {'npf54789befb391a838://auth#'}
                <span style={{ color: 'var(--green)' }}>{'session_token_code='}</span>
                <span style={{ background: 'var(--green)', color: 'var(--void)', padding: '2px 4px', fontWeight: 500 }}>eyJhbGc…aBc123</span>
                {'&state=…'}
              </pre>
            )}

            {step === 6 && (
              <div style={{ marginTop: 18 }}>
                <label htmlFor="nt-input-desktop" className="t-up t-faint" style={{ fontSize: 'var(--text-3xs)' }}>// paste address-bar url</label>
                <input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  id="nt-input-desktop"
                  className="field"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="paste the npf://auth#session_token_code=… URL"
                  style={{
                    marginTop: 8, width: '100%', height: 38, fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--mono)',
                    background: 'var(--ink-2)', border: '1px solid var(--rule-bright)',
                    color: 'var(--paper)', padding: '0 12px', outline: 'none',
                  }}
                />
                <div className="t-faint" style={{ fontSize: 'var(--text-3xs)', marginTop: 6 }}>
                  {trimmed.length} chars · paste the full url or just the code value.
                </div>
                {error && (
                  <div style={{ fontSize: 'var(--text-2xs)', marginTop: 8, color: 'var(--red)' }}>{error}</div>
                )}
              </div>
            )}

            {step === 7 && (
              <div className="panel" style={{ marginTop: 16, padding: 14, background: 'var(--ink-2)', borderColor: 'var(--green)', display: 'flex', gap: 10 }}>
                <Icon name="check" size={16} style={{ color: 'var(--green)', marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--green)' }}>Nintendo connected!</div>
                  <div className="t-faint" style={{ fontSize: 'var(--text-2xs)', marginTop: 4, lineHeight: 1.4 }}>
                    Library + per-title playtime syncing. A freshly-paired Switch can take ~24h for the first daily summary; subsequent syncs pull only the delta.
                  </div>
                </div>
              </div>
            )}

            {step < 7 && (
              <div className="panel" style={{ marginTop: 18, padding: 12, background: 'var(--ink-2)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <Icon name="shield" size={14} style={{ color: 'var(--green)', marginTop: 1 }} />
                <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--paper-dim)', lineHeight: 1.5 }}>
                  <div style={{ color: 'var(--paper)' }}>session token lasts months.</div>
                  hoard refreshes the short-lived access token on every sync; the long-lived session token stays put. credentials are encrypted at rest and never logged.
                </div>
              </div>
            )}

            <div style={{ flex: 1 }} />

            {/* nav */}
            <div style={{ marginTop: 24, display: 'flex', gap: 10, alignItems: 'center' }}>
              {step > 1 && step < 7 && (
                <Btn onClick={() => setStep((s) => s - 1)}>
                  <Icon name="back" size={11} /> step {step - 1}
                </Btn>
              )}
              <span style={{ flex: 1 }} />
              <Btn
                {...(step === 7 || canAdvance ? { variant: 'primary' as const } : {})}
                disabled={!canAdvance || saving}
                onClick={() => void handleNext()}
              >
                {saving ? 'exchanging…' : step === 7 ? 'done →' : step === 6 ? 'save & connect' : `next · step ${step + 1} →`}
              </Btn>
            </div>
          </div>

          {/* RIGHT — context (QR / app mock / address-bar mock) */}
          <div style={{ padding: 28, background: 'var(--ink-2)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="t-up t-faint" style={{ fontSize: 'var(--text-3xs)' }}>// what you should see</div>

            {step <= 3 && (
              <div style={{ border: '1px solid var(--rule-bright)', background: 'var(--void)', flex: 1, padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="t-up t-faint" style={{ fontSize: 'var(--text-3xs)' }}>// parental controls · pairing</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--paper-dim)', lineHeight: 1.6 }}>
                  <div style={{ color: 'var(--paper)', marginBottom: 6 }}>parent &rarr; child</div>
                  you (own nintendo account)
                  <div style={{ marginLeft: 12, color: 'var(--green)' }}>&rarr; you (same account, acts as child)</div>
                  <div style={{ marginLeft: 24, color: 'var(--paper)' }}>&rarr; your switch console</div>
                </div>
                <div className="t-faint" style={{ fontSize: 'var(--text-2xs)', lineHeight: 1.6, marginTop: 4 }}>
                  Nintendo allows a single account to pair as both parent and child. Once linked, the parent account can read play activity — that&rsquo;s what Hoard taps into.
                </div>
                <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--amber)', fontSize: 'var(--text-2xs)' }}>
                  <Icon name="info" size={11} /> already paired? skip ahead from the left panel.
                </div>
              </div>
            )}

            {step === 4 && (
              <div style={{ border: '1px solid var(--rule-bright)', background: 'var(--void)', flex: 1, padding: 22, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
                <div className="t-up t-faint" style={{ fontSize: 'var(--text-3xs)', alignSelf: 'flex-start' }}>// or scan with your phone</div>
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR code for the Nintendo sign-in URL" width={220} height={220} style={{ imageRendering: 'pixelated' }} />
                ) : (
                  <div className="t-faint" style={{ fontSize: 'var(--text-xs)', padding: 40 }}>// generating qr…</div>
                )}
                <div className="t-faint" style={{ fontSize: 'var(--text-2xs)', textAlign: 'center', lineHeight: 1.5 }}>
                  signing in on the same phone you used to pair the switch tends to be smoother — nintendo&rsquo;s mobile cookies often persist between the parental controls app and safari/chrome.
                </div>
              </div>
            )}

            {step === 5 && (
              <div style={{ border: '1px solid var(--rule-bright)', background: 'var(--void)', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {/* fake address bar */}
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--ink)' }}>
                  <span style={{ display: 'inline-flex', gap: 4 }}>
                    {[0, 1, 2].map((i) => (
                      <span key={i} style={{ width: 8, height: 8, background: 'var(--paper-faint)' }} />
                    ))}
                  </span>
                  <div className="field" style={{ flex: 1, height: 22, fontSize: 'var(--text-3xs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }}>
                    <span style={{ background: 'var(--green)', color: 'var(--void)', padding: '1px 4px', fontWeight: 500 }}>npf54789…://auth#session_token_code=eyJhb…</span>
                  </div>
                  <Icon name="copy" size={11} style={{ color: 'var(--green)' }} />
                </div>
                <div style={{ padding: 20, flex: 1, fontFamily: 'var(--mono)', fontSize: 'var(--text-xs)', lineHeight: 1.65, color: 'var(--paper-dim)', overflow: 'auto', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <div className="t-red" style={{ color: 'var(--red)', fontSize: 'var(--text-sm)' }}>
                    This site can&rsquo;t be reached
                  </div>
                  <div className="t-faint" style={{ fontSize: 'var(--text-2xs)', maxWidth: 260, lineHeight: 1.55 }}>
                    expected. the page body is broken, but the address bar holds the session_token_code value. select the URL → ⌘C.
                  </div>
                </div>
              </div>
            )}

            {(step === 6 || step === 7) && (
              <div style={{ border: '1px solid var(--rule-bright)', background: 'var(--void)', flex: 1, padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="t-up t-faint" style={{ fontSize: 'var(--text-3xs)' }}>// what hoard does with the url</div>
                <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--paper-dim)', lineHeight: 1.65 }}>
                  <div>1. extract <span className="t-amber">session_token_code</span> from the fragment</div>
                  <div>2. exchange with PKCE verifier → <span className="t-amber">session_token</span> (months)</div>
                  <div>3. exchange session_token → <span className="t-amber">access_token</span> (15 min)</div>
                  <div>4. fetch your Nintendo Account profile (naId + nickname)</div>
                  <div>5. persist on Platform.credentials · start first sync</div>
                </div>
                <div className="t-faint" style={{ fontSize: 'var(--text-2xs)', marginTop: 4, lineHeight: 1.6 }}>
                  Subsequent syncs reuse the session_token to mint fresh access tokens every 15 min — you only do this paste flow once per Nintendo Account.
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, fontSize: 'var(--text-3xs)', color: 'var(--paper-dim)', alignItems: 'center' }}>
              <Icon name="info" size={11} /> session token ≈ months · access token ≈ 15 min · hoard auto-refreshes
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default NintendoGuidedFlowDesktop;
