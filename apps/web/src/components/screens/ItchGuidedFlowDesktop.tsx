import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { Marker } from '../primitives/Marker';
import { api } from '../../lib/api';

const ITCH_STEPS = [
  { n: 1, t: 'open itch.io api keys',   d: 'Open your itch.io API keys page in a new tab. The key acts as a read-only credential — no password ever leaves your browser.' },
  { n: 2, t: 'generate + copy a key',   d: 'Click "Generate new API key" (or use an existing one) and copy the long token string. itch.io shows the key in plaintext — copy the whole thing.' },
  { n: 3, t: 'paste into hoard',         d: 'Paste the key below. Hoard validates it against itch.io’s /me endpoint before saving.' },
  { n: 4, t: 'all set',                  d: 'Library sync is starting. itch.io doesn’t expose playtime, so games land in Backlog. Many itch.io games aren’t in IGDB (jam entries, etc.) and may skip — manual-add still works for those.' },
] as const;

const ITCH_API_KEYS_URL = 'https://itch.io/user/settings/api-keys';

export function ItchGuidedFlowDesktop() {
  useDocumentTitle('Connect itch.io');
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const trimmedKey = input.trim();
  const canAdvance =
    step < 3 ||
    (step === 3 && trimmedKey.length >= 10) ||
    step === 4;

  async function handleNext(): Promise<void> {
    if (step === 3) {
      setSaving(true);
      setError('');
      try {
        await api.connectItch(trimmedKey);
        setStep(4);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        setError(
          msg.startsWith('401')
            ? 'Not signed in to Hoard — open /login first, then come back here.'
            : msg.startsWith('400')
              ? 'itch.io rejected the key. Generate a fresh one at itch.io/user/settings/api-keys and try again.'
              : 'Server error saving the key — check the API is running and try again.',
        );
      } finally {
        setSaving(false);
      }
      return;
    }
    if (step === 4) {
      navigate('/settings/platforms/it');
      return;
    }
    setStep((s) => Math.min(s + 1, 4));
  }

  return (
    <div className="hoard-screen hoard-noise" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div style={{ width: 1080, maxWidth: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column' }}>

        {/* header */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <Marker>// connect / itch.io · step {step} of {ITCH_STEPS.length}</Marker>
            <h1 className="t-display" style={{ fontSize: 30, marginTop: 8, color: 'var(--paper)', letterSpacing: '-0.01em', margin: 0, fontWeight: 'normal' }}>
              connect your itch.io library
            </h1>
            <div className="t-faint" style={{ fontSize: 'var(--text-xs)', marginTop: 4 }}>
              itch.io uses a personal api key — read-only, single-input paste. no oauth dance.
            </div>
          </div>
          <button
            type="button"
            className="t-faint"
            aria-label="Cancel guided flow"
            onClick={() => navigate('/settings/platforms/it')}
            style={{ fontSize: 'var(--text-2xs)', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', background: 'transparent', border: 'none', padding: 4, margin: -4, fontFamily: 'inherit', color: 'inherit' }}
          >
            <Icon name="x" size={11} /> cancel
          </button>
        </div>

        {/* step tracker */}
        <div className="panel" style={{ padding: '14px 18px', marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ITCH_STEPS.length}, 1fr)`, gap: 10 }}>
            {ITCH_STEPS.map((s) => {
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
            <Marker>// step {step} · {ITCH_STEPS[step - 1]!.t}</Marker>
            <div className="t-display" style={{ fontSize: 'var(--text-lg)', marginTop: 8, color: 'var(--paper)' }}>
              {ITCH_STEPS[step - 1]!.t}
            </div>
            <div style={{ marginTop: 10, color: 'var(--paper-dim)', fontSize: 'var(--text-sm)', lineHeight: 1.55 }}>
              {ITCH_STEPS[step - 1]!.d}
            </div>

            {step === 1 && (
              <div style={{ marginTop: 18 }}>
                <a
                  href={ITCH_API_KEYS_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="btn primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-xs)' }}
                >
                  <Icon name="ext" size={11} /> open itch.io api keys →
                </a>
              </div>
            )}

            {step === 2 && (
              <pre className="ascii" style={{
                marginTop: 14, padding: 14,
                background: 'var(--ink-2)', border: '1px solid var(--rule)',
                fontSize: 'var(--text-xs)', lineHeight: 1.65,
                color: 'var(--paper-dim)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>
                <span className="t-faint">// itch.io api keys page</span>{'\n'}
                <span style={{ color: 'var(--paper)' }}>your api keys</span>{'\n'}
                <span style={{ color: 'var(--paper-dim)' }}>┌──────────────────────────────────────┐</span>{'\n'}
                <span style={{ color: 'var(--paper-dim)' }}>│ </span>
                <span style={{ background: 'var(--green)', color: 'var(--void)', padding: '2px 4px', fontWeight: 500 }}>aBc123…XyZ789</span>
                <span style={{ color: 'var(--paper-dim)' }}>     [copy] [revoke] │</span>{'\n'}
                <span style={{ color: 'var(--paper-dim)' }}>└──────────────────────────────────────┘</span>{'\n'}
                <span style={{ color: 'var(--amber)' }}>[+ generate new API key]</span>
              </pre>
            )}

            {step === 3 && (
              <div style={{ marginTop: 18 }}>
                <label htmlFor="itch-key-input-desktop" className="t-up t-faint" style={{ fontSize: 'var(--text-3xs)' }}>// paste api key</label>
                <input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  id="itch-key-input-desktop"
                  className="field"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="paste your itch.io api key…"
                  style={{
                    marginTop: 8, width: '100%', height: 38, fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--mono)',
                    background: 'var(--ink-2)', border: '1px solid var(--rule-bright)',
                    color: 'var(--paper)', padding: '0 12px', outline: 'none',
                  }}
                />
                <div className="t-faint" style={{ fontSize: 'var(--text-3xs)', marginTop: 6 }}>
                  {trimmedKey.length} chars · we validate against itch.io before saving
                </div>
                {error && (
                  <div className="t-red" style={{ fontSize: 'var(--text-2xs)', marginTop: 8, color: 'var(--red)' }}>{error}</div>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="panel" style={{ marginTop: 16, padding: 14, background: 'var(--ink-2)', borderColor: 'var(--green)', display: 'flex', gap: 10 }}>
                <Icon name="check" size={16} style={{ color: 'var(--green)', marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--green)' }}>itch.io connected!</div>
                  <div className="t-faint" style={{ fontSize: 'var(--text-2xs)', marginTop: 4, lineHeight: 1.4 }}>
                    Library sync is starting. itch.io doesn&rsquo;t expose playtime, so games land in Backlog by default. Many itch.io games aren&rsquo;t in IGDB (jam entries) and may skip — they show up in the platform&rsquo;s activity log so you can manual-add them.
                  </div>
                </div>
              </div>
            )}

            {step < 4 && (
              <div className="panel" style={{ marginTop: 18, padding: 12, background: 'var(--ink-2)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <Icon name="shield" size={14} style={{ color: 'var(--green)', marginTop: 1 }} />
                <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--paper-dim)', lineHeight: 1.5 }}>
                  <div style={{ color: 'var(--paper)' }}>read-only access.</div>
                  the api key lets hoard read your owned games list. revoke it any time from itch.io&rsquo;s settings page.
                </div>
              </div>
            )}

            <div style={{ flex: 1 }} />

            {/* nav */}
            <div style={{ marginTop: 24, display: 'flex', gap: 10, alignItems: 'center' }}>
              {step > 1 && step < 4 && (
                <Btn onClick={() => setStep((s) => s - 1)}>
                  <Icon name="back" size={11} /> step {step - 1}
                </Btn>
              )}
              <span style={{ flex: 1 }} />
              <Btn
                {...(step === 4 || canAdvance ? { variant: 'primary' as const } : {})}
                disabled={!canAdvance || saving}
                onClick={() => void handleNext()}
              >
                {saving ? 'validating…' : step === 4 ? 'done →' : step === 3 ? 'save & connect' : `next · step ${step + 1} →`}
              </Btn>
            </div>
          </div>

          {/* RIGHT — context */}
          <div style={{ padding: 28, background: 'var(--ink-2)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="t-up t-faint" style={{ fontSize: 'var(--text-3xs)' }}>// what to expect</div>

            <div style={{ border: '1px solid var(--rule-bright)', background: 'var(--void)', flex: 1, padding: 18, fontFamily: 'var(--mono)', fontSize: 'var(--text-xs)', lineHeight: 1.7, color: 'var(--paper-dim)', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ color: 'var(--paper)', fontSize: 'var(--text-sm)' }}>library only.</div>
                <div className="t-faint" style={{ fontSize: 'var(--text-2xs)', lineHeight: 1.55, marginTop: 4 }}>
                  itch.io exposes your owned + claimed games. no playtime, no achievements (itch.io doesn&rsquo;t track them), no wishlist.
                </div>
              </div>

              <div>
                <div style={{ color: 'var(--paper)', fontSize: 'var(--text-sm)' }}>igdb match rate is low.</div>
                <div className="t-faint" style={{ fontSize: 'var(--text-2xs)', lineHeight: 1.55, marginTop: 4 }}>
                  most itch.io games are jam entries / hobby releases not in igdb. unmatched titles surface in the activity log; manual-add still works for them.
                </div>
              </div>

              <div>
                <div style={{ color: 'var(--paper)', fontSize: 'var(--text-sm)' }}>sync cadence: hourly.</div>
                <div className="t-faint" style={{ fontSize: 'var(--text-2xs)', lineHeight: 1.55, marginTop: 4 }}>
                  changeable per-platform under settings → platforms. itch libraries don&rsquo;t change often, so default cadence is fine.
                </div>
              </div>

              <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--amber)', fontSize: 'var(--text-2xs)' }}>
                <Icon name="info" size={11} /> api key never appears in logs or browser history
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default ItchGuidedFlowDesktop;
