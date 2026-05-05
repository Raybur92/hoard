import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { Marker } from '../primitives/Marker';
import { api } from '../../lib/api';

const PSN_STEPS = [
  { n: 1, t: 'sign in to psn',       d: 'Open the PlayStation login in a new tab and authenticate with your normal credentials.' },
  { n: 2, t: 'visit auth endpoint',  d: 'After signing in, open the NPSSO endpoint. Sony returns a tiny JSON blob containing your token.' },
  { n: 3, t: 'copy the npsso',       d: 'Copy the 64-character string between the quotes. Nothing else — just the token.' },
  { n: 4, t: 'paste into hoard',     d: "Paste the token below. Hoard validates it locally before sending anything." },
  { n: 5, t: 'all set',              d: "We'll fetch your library, playtime, and trophies. First sync usually takes 30–90 seconds." },
] as const;

const SONY_AUTH_URL = 'https://ca.account.sony.com/api/v1/ssocookie';
const SONY_LOGIN_URL = 'https://my.account.sony.com/central/signin';

export function PsnGuidedFlowDesktop() {
  useDocumentTitle("Connect PSN");
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [npsso, setNpsso] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canAdvance =
    step < 4 ||
    (step === 4 && npsso.length === 64) ||
    step === 5;

  async function handleNext() {
    if (step === 4) {
      setSaving(true);
      setError('');
      try {
        await api.connectPsn(npsso);
        setStep(5);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        setError(
          msg.startsWith('401')
            ? 'Not signed in — open /login first, then come back here.'
            : msg.startsWith('400')
              ? 'Token format invalid — must be exactly 64 alphanumeric characters.'
              : 'Server error saving token — check the API is running and try again.',
        );
      } finally {
        setSaving(false);
      }
      return;
    }
    if (step === 5) {
      navigate('/settings/platforms/ps');
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
            <Marker>// connect / playstation network · step {step} of {PSN_STEPS.length}</Marker>
            <div className="t-display" style={{ fontSize: 30, marginTop: 8, color: 'var(--paper)', letterSpacing: '-0.01em' }}>
              get your psn token
            </div>
            <div className="t-faint" style={{ fontSize: "var(--text-xs)", marginTop: 4 }}>
              psn has no public api. we pass-through the same cookie your browser uses. hoard never sees your password.
            </div>
          </div>
          <button
            type="button"
            className="t-faint"
            aria-label="Cancel guided flow"
            onClick={() => navigate('/settings/platforms/ps')}
            style={{ fontSize: "var(--text-2xs)", display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', background: 'transparent', border: 'none', padding: 4, margin: -4, fontFamily: 'inherit', color: 'inherit' }}
          >
            <Icon name="x" size={11} /> cancel
          </button>
        </div>

        {/* step tracker */}
        <div className="panel" style={{ padding: '14px 18px', marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${PSN_STEPS.length}, 1fr)`, gap: 10 }}>
            {PSN_STEPS.map((s) => {
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
            <Marker>// step {step} · {PSN_STEPS[step - 1]!.t}</Marker>
            <div className="t-display" style={{ fontSize: "var(--text-lg)", marginTop: 8, color: 'var(--paper)' }}>
              {PSN_STEPS[step - 1]!.t}
            </div>
            <div style={{ marginTop: 10, color: 'var(--paper-dim)', fontSize: "var(--text-sm)", lineHeight: 1.55 }}>
              {PSN_STEPS[step - 1]!.d}
            </div>

            {step === 2 && (
              <div style={{ marginTop: 14 }}>
                <div className="t-up t-faint" style={{ fontSize: "var(--text-3xs)", marginBottom: 8 }}>// open these links in order</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <a href={SONY_LOGIN_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--paper)', fontSize: "var(--text-xs)", display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="ext" size={11} /> 1. Sign in to PlayStation
                  </a>
                  <a href={SONY_AUTH_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--amber)', fontSize: "var(--text-xs)", display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="ext" size={11} /> 2. Open auth endpoint (copy from here)
                  </a>
                </div>
              </div>
            )}

            {step === 3 && (
              <pre className="ascii" style={{
                marginTop: 14, padding: 14,
                background: 'var(--ink-2)', border: '1px solid var(--rule)',
                fontSize: "var(--text-xs)", lineHeight: 1.65,
                color: 'var(--paper-dim)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>
                {'{\n  "npsso": '}<span style={{ color: 'var(--green)' }}>"aB3kF9...x2eP8e2f"</span>{'\n}'}
              </pre>
            )}

            {step === 4 && (
              <div style={{ marginTop: 18 }}>
                <label htmlFor="psn-npsso-input-desktop" className="t-up t-faint" style={{ fontSize: "var(--text-3xs)" }}>// paste token here</label>
                <input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  id="psn-npsso-input-desktop"
                  className="field"
                  value={npsso}
                  onChange={(e) => setNpsso(e.target.value.trim())}
                  placeholder="aB3kF9...x2eP8e2f  (64 chars)"
                  style={{
                    marginTop: 8, width: '100%', height: 38, fontSize: "var(--text-xs)",
                    fontFamily: 'var(--mono)', letterSpacing: '0.04em',
                    background: 'var(--ink-2)', border: '1px solid var(--rule-bright)',
                    color: 'var(--paper)', padding: '0 12px', outline: 'none',
                  }}
                  maxLength={64}
                />
                <div className="t-faint" style={{ fontSize: "var(--text-3xs)", marginTop: 6 }}>
                  {npsso.length}/64 · hoard validates locally before sending.
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
                  <div style={{ fontSize: "var(--text-sm)", color: 'var(--green)' }}>PSN connected!</div>
                  <div className="t-faint" style={{ fontSize: "var(--text-2xs)", marginTop: 4, lineHeight: 1.4 }}>
                    Your library is syncing in the background. Check the Platforms page in a few moments.
                  </div>
                </div>
              </div>
            )}

            {step < 5 && (
              <div className="panel" style={{ marginTop: 18, padding: 12, background: 'var(--ink-2)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <Icon name="shield" size={14} style={{ color: 'var(--green)', marginTop: 1 }} />
                <div style={{ fontSize: "var(--text-2xs)", color: 'var(--paper-dim)', lineHeight: 1.5 }}>
                  <div style={{ color: 'var(--paper)' }}>this stays on your device until step 4.</div>
                  hoard validates the format locally before sending. tokens are encrypted at rest and never logged.
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
                {saving ? 'saving…' : step === 5 ? 'done →' : step === 4 ? 'save & connect' : `next · step ${step + 1} →`}
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
                <div className="field" style={{ flex: 1, height: 22, fontSize: "var(--text-3xs)" }}>
                  <span className="pre" style={{ color: 'var(--green)' }}>https://</span>
                  <span style={{ color: 'var(--paper-dim)' }}>ca.account.sony.com/api/v1/ssocookie</span>
                </div>
                <Icon name="refresh" size={11} style={{ color: 'var(--paper-faint)' }} />
              </div>

              <div style={{ padding: 18, flex: 1, fontFamily: 'var(--mono)', fontSize: "var(--text-sm)", lineHeight: 1.7, color: 'var(--paper-dim)', overflow: 'auto' }}>
                <div style={{ color: 'var(--paper-faint)', fontSize: "var(--text-3xs)", marginBottom: 10 }}>view-source · application/json</div>
                <div>{'{'}</div>
                <div style={{ paddingLeft: 18 }}>
                  "npsso":{' '}
                  <span style={{ background: 'var(--green)', color: 'var(--void)', padding: '2px 4px', fontWeight: 500 }}>
                    "aB3kF9zL2pQ7vN4mR8xK1jH5cD6bV0nU2eY3wT9sM4iO7uP8e2f"
                  </span>
                </div>
                <div>{'}'}</div>
                <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--green)', fontSize: "var(--text-2xs)" }}>
                  <Icon name="copy" size={11} /> highlighted · ⌘C to copy
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, fontSize: "var(--text-3xs)", color: 'var(--paper-faint)', alignItems: 'center' }}>
              <Icon name="info" size={11} /> 64 chars · hex/letters only · expires 60 days from issue
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
