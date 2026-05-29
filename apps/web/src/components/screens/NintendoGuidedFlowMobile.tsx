import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { MobileFrame } from '../layout/MobileFrame';
import { MobileHeader } from '../layout/MobileHeader';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { Marker } from '../primitives/Marker';
import { api } from '../../lib/api';

// M3 — Nintendo Switch guided flow (mobile).
//
// 7-step paste flow. On mobile we DON'T render a QR (the user is already
// on their phone — same device that has the Parental Controls app). The
// auth URL opens in the system browser; after sign-in Nintendo redirects
// to `npf...://auth#session_token_code=...` which Safari/Chrome can't
// follow — user copies the address-bar URL and pastes back into Hoard.
const NT_STEPS = [
  { n: 1, t: 'how this works',     d: "Nintendo doesn't publish a games API. We use Parental Controls — same data, one-time setup. You'll act as your own guardian." },
  { n: 2, t: 'install the app',    d: 'Install "Nintendo Switch Parental Controls" from the App Store or Google Play. The app produces the data Hoard reads.' },
  { n: 3, t: 'pair your switch',   d: 'In the app, register your Switch with your own Nintendo Account as the parent. You sign in as both parent + child.' },
  { n: 4, t: 'open nintendo sign-in', d: 'Tap the link below. Sign in with the same Nintendo Account you paired in step 3.' },
  { n: 5, t: 'copy the redirect',  d: 'After sign-in the browser shows "site can’t be reached" — expected. Long-press the URL bar → Copy.' },
  { n: 6, t: 'paste into hoard',   d: 'Paste the URL below. Hoard extracts the session_token_code and starts the first sync.' },
  { n: 7, t: 'all set',            d: 'Library + per-title playtime syncing. New consoles take ~24h for the first daily summary.' },
] as const;

export function NintendoGuidedFlowMobile() {
  useDocumentTitle('Connect Nintendo Switch');
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [verifier, setVerifier] = useState<string | null>(null);
  const [authUrlError, setAuthUrlError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (step < 4 || fetchedRef.current) return;
    fetchedRef.current = true;
    void api.nintendoAuthUrl()
      .then((r) => { setAuthUrl(r.url); setVerifier(r.verifier); })
      .catch(() => setAuthUrlError('Failed to load Nintendo auth URL.'));
  }, [step]);

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
        await api.connectNintendo({ redirectUrl: trimmed, verifier });
        setStep(7);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        setError(
          msg.startsWith('401')
            ? 'Not signed in — open /login first.'
            : msg.startsWith('400')
              ? "Nintendo rejected the code. Codes expire fast — go back to step 4 and start over."
              : 'Server error — check the API is running and try again.',
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

  return (
    <MobileFrame>
      <MobileHeader
        title="connect nintendo"
        sub={`// step ${step} of ${NT_STEPS.length}`}
        back
        right={
          <button
            type="button"
            aria-label="Cancel guided flow"
            onClick={() => navigate('/settings/platforms/nt')}
            style={{ background: 'transparent', border: 'none', padding: 8, margin: -8, color: 'inherit', cursor: 'pointer' }}
          >
            <Icon name="x" size={14} />
          </button>
        }
      />

      <div style={{ padding: '12px 16px', display: 'flex', gap: 4, alignItems: 'center', borderBottom: '1px solid var(--rule)', overflowX: 'auto' }}>
        {NT_STEPS.map((s) => {
          const done = s.n < step, active = s.n === step;
          const c = done ? 'var(--green)' : active ? 'var(--paper)' : 'var(--paper-faint)';
          return (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <span style={{
                width: 18, height: 18,
                border: `1px solid ${c}`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: done ? c : 'transparent',
                fontSize: 'var(--text-2xs)', color: done ? 'var(--void)' : c,
                fontFamily: 'var(--mono)',
                flexShrink: 0,
              }}>
                {done ? <Icon name="check" size={9} /> : s.n}
              </span>
              {s.n < NT_STEPS.length && (
                <span style={{ display: 'inline-block', width: 14, height: 1, background: s.n < step ? 'var(--green)' : 'var(--rule)', margin: '0 3px' }} />
              )}
            </div>
          );
        })}
      </div>

      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '16px 16px 20px' }}>
        <Marker>// step {step} · {NT_STEPS[step - 1]!.t}</Marker>
        <div style={{ marginTop: 8, fontSize: 'var(--text-md)', lineHeight: 1.25, color: 'var(--paper)' }}>
          {NT_STEPS[step - 1]!.t}
        </div>
        <div className="t-faint" style={{ fontSize: 'var(--text-xs)', marginTop: 8, lineHeight: 1.5 }}>
          {NT_STEPS[step - 1]!.d}
        </div>

        {(step === 2 || step === 3) && (
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              onClick={() => setStep(4)}
              style={{ background: 'transparent', border: 'none', padding: 0, fontFamily: 'var(--mono)', fontSize: 'var(--text-xs)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, color: 'var(--amber)' }}
            >
              // skip ahead · already paired →
            </button>
          </div>
        )}

        {step === 2 && (
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <a href="https://apps.apple.com/app/nintendo-switch-parental-controls/id1190074407" target="_blank" rel="noreferrer">
              <div className="field">
                <span style={{ color: 'var(--paper)' }}>App Store · iOS</span>
                <span style={{ flex: 1 }} />
                <Icon name="ext" size={11} />
              </div>
            </a>
            <a href="https://play.google.com/store/apps/details?id=com.nintendo.znma" target="_blank" rel="noreferrer">
              <div className="field">
                <span style={{ color: 'var(--paper)' }}>Google Play · Android</span>
                <span style={{ flex: 1 }} />
                <Icon name="ext" size={11} />
              </div>
            </a>
          </div>
        )}

        {step === 4 && (
          <div style={{ marginTop: 14 }}>
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
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)' }}
                >
                  <Icon name="ext" size={11} /> open nintendo sign-in →
                </a>
                <div className="t-faint" style={{ fontSize: 'var(--text-3xs)', marginTop: 8, lineHeight: 1.5 }}>
                  after sign-in your browser will show a page-not-found error — expected. the address bar still has the code.
                </div>
              </>
            ) : (
              <div className="t-faint" style={{ fontSize: 'var(--text-xs)' }}>// loading auth url…</div>
            )}
          </div>
        )}

        {step === 5 && (
          <div style={{ marginTop: 14, border: '1px solid var(--rule-bright)', background: 'var(--ink-2)', padding: 12 }}>
            <div className="t-up t-faint" style={{ fontSize: 'var(--text-2xs)' }}>// the redirect url</div>
            <pre className="ascii" style={{ marginTop: 8, fontSize: 'var(--text-2xs)', lineHeight: 1.65, color: 'var(--paper-dim)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {'npf…://auth#'}<span style={{ color: 'var(--green)' }}>session_token_code=</span><span style={{ background: 'var(--green)', color: 'var(--void)', padding: '1px 3px' }}>eyJhbGc…</span>
            </pre>
          </div>
        )}

        {step === 6 && (
          <div style={{ marginTop: 18 }}>
            <label htmlFor="nt-input-mobile" className="t-up t-faint" style={{ fontSize: 'var(--text-2xs)' }}>// paste url</label>
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              id="nt-input-mobile"
              className="field"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="paste npf:// redirect url"
              style={{
                display: 'block', width: '100%', marginTop: 8, height: 38, fontSize: 'var(--text-2xs)',
                fontFamily: 'var(--mono)',
                background: 'var(--ink-2)', border: '1px solid var(--rule-bright)',
                color: 'var(--paper)', padding: '0 12px', outline: 'none',
              }}
            />
            <div className="t-faint" style={{ fontSize: 'var(--text-3xs)', marginTop: 6 }}>
              {trimmed.length} chars · paste the full url or the bare code value.
            </div>
            {error && <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--red)', marginTop: 8 }}>{error}</div>}
          </div>
        )}

        {step === 7 && (
          <div className="panel" style={{ marginTop: 16, padding: 14, background: 'var(--ink-2)', borderColor: 'var(--green)', display: 'flex', gap: 10 }}>
            <Icon name="check" size={14} style={{ color: 'var(--green)', marginTop: 1 }} />
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--green)' }}>Nintendo connected! Library syncing…</div>
          </div>
        )}

        {step < 7 && (
          <div className="panel" style={{ marginTop: 18, padding: 12, background: 'var(--ink-2)', display: 'flex', gap: 10 }}>
            <Icon name="shield" size={13} style={{ color: 'var(--green)', marginTop: 1 }} />
            <div className="t-faint" style={{ fontSize: 'var(--text-2xs)', lineHeight: 1.5 }}>
              <span style={{ color: 'var(--paper)' }}>encrypted at rest.</span> session token lasts months; access tokens refresh automatically.
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--rule)', display: 'flex', gap: 8, background: 'var(--ink)' }}>
        {step > 1 && step < 7 && (
          <Btn sm onClick={() => setStep((s) => s - 1)}>
            <Icon name="back" size={11} />
          </Btn>
        )}
        <Btn
          sm
          {...(canAdvance ? { variant: 'primary' as const } : {})}
          disabled={!canAdvance || saving}
          style={{ flex: 1 }}
          onClick={() => void handleNext()}
        >
          {saving ? 'exchanging…' : step === 7 ? 'done →' : step === 6 ? 'save & connect' : 'next →'}
        </Btn>
      </div>
    </MobileFrame>
  );
}

export default NintendoGuidedFlowMobile;
