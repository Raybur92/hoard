import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileFrame } from '../layout/MobileFrame';
import { MobileHeader } from '../layout/MobileHeader';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { Marker } from '../primitives/Marker';
import { api } from '../../lib/api';

const PSN_STEPS = [
  { n: 1, t: 'sign in to psn',       d: 'Open the PlayStation login in Safari and authenticate with your credentials.' },
  { n: 2, t: 'visit auth endpoint',  d: 'Open the NPSSO endpoint URL. Sony returns a tiny JSON blob.' },
  { n: 3, t: 'copy the npsso',       d: 'Long-press the highlighted string and copy it — exactly 64 characters.' },
  { n: 4, t: 'paste into hoard',     d: "Paste below. Hoard validates locally before sending anything." },
  { n: 5, t: 'all set',              d: "Library sync is running in the background." },
] as const;

const SONY_AUTH_URL = 'https://ca.account.sony.com/api/v1/ssocookie';
const SONY_LOGIN_URL = 'https://my.account.sony.com/central/signin';

export function PsnGuidedFlowMobile() {
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
              ? 'Token format invalid — must be exactly 64 characters.'
              : 'Server error — check the API is running and try again.',
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
    <MobileFrame>
      <MobileHeader
        title="connect psn"
        sub={`// step ${step} of ${PSN_STEPS.length}`}
        back
        right={
          <span onClick={() => navigate('/settings/platforms/ps')}>
            <Icon name="x" size={14} />
          </span>
        }
      />

      {/* compact stepper dots */}
      <div style={{ padding: '12px 16px', display: 'flex', gap: 6, alignItems: 'center', borderBottom: '1px solid var(--rule)' }}>
        {PSN_STEPS.map((s) => {
          const done = s.n < step, active = s.n === step;
          const c = done ? 'var(--green)' : active ? 'var(--paper)' : 'var(--paper-faint)';
          return (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: s.n < PSN_STEPS.length ? 'none' : undefined }}>
              <span style={{
                width: 18, height: 18,
                border: `1px solid ${c}`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: done ? c : 'transparent',
                fontSize: 9, color: done ? 'var(--void)' : c,
                fontFamily: 'var(--mono)',
                flexShrink: 0,
              }}>
                {done ? <Icon name="check" size={9} /> : s.n}
              </span>
              {s.n < PSN_STEPS.length && (
                <span style={{ display: 'inline-block', width: 20, height: 1, background: s.n < step ? 'var(--green)' : 'var(--rule)', margin: '0 4px' }} />
              )}
            </div>
          );
        })}
      </div>

      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '16px 16px 20px' }}>
        <Marker>// step {step} · {PSN_STEPS[step - 1]!.t}</Marker>
        <div style={{ marginTop: 8, fontSize: 16, lineHeight: 1.25, color: 'var(--paper)' }}>
          {PSN_STEPS[step - 1]!.t}
        </div>
        <div className="t-faint" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
          {PSN_STEPS[step - 1]!.d}
        </div>

        {step === 2 && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <a href={SONY_LOGIN_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--paper)', fontSize: 12 }}>
              <div className="field">
                <span className="pre">https://</span>
                <span className="t-dim">my.account.sony.com — sign in</span>
                <span style={{ flex: 1 }} />
                <Icon name="ext" size={11} />
              </div>
            </a>
            <a href={SONY_AUTH_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--amber)', fontSize: 12 }}>
              <div className="field" style={{ borderColor: 'var(--amber)' }}>
                <span className="pre">https://</span>
                <span style={{ color: 'var(--paper-dim)' }}>ca.account.sony.com/…</span>
                <span style={{ flex: 1 }} />
                <Icon name="ext" size={11} />
              </div>
            </a>
          </div>
        )}

        {step === 3 && (
          <div style={{ marginTop: 14, border: '1px solid var(--rule-bright)', background: 'var(--ink-2)', padding: 12 }}>
            <div className="t-up t-faint" style={{ fontSize: 9 }}>// what you'll see</div>
            <pre className="ascii" style={{ marginTop: 8, fontSize: 11, lineHeight: 1.65, color: 'var(--paper-dim)' }}>
              {'{\n  "npsso": '}<span style={{ background: 'var(--green)', color: 'var(--void)', padding: '1px 3px' }}>"aB3kF9..8e2f"</span>{'\n}'}
            </pre>
          </div>
        )}

        {step === 4 && (
          <div style={{ marginTop: 18 }}>
            <div className="t-up t-faint" style={{ fontSize: 9 }}>// paste here</div>
            <input
              autoFocus
              className="field"
              value={npsso}
              onChange={(e) => setNpsso(e.target.value.trim())}
              placeholder="paste 64-char token…"
              style={{
                display: 'block', width: '100%', marginTop: 8, height: 38, fontSize: 11,
                fontFamily: 'var(--mono)',
                background: 'var(--ink-2)', border: '1px solid var(--rule-bright)',
                color: 'var(--paper)', padding: '0 12px', outline: 'none',
              }}
              maxLength={64}
            />
            <div className="t-faint" style={{ fontSize: 10, marginTop: 6 }}>
              {npsso.length}/64 · hoard validates locally · nothing sent yet.
            </div>
            {error && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 8 }}>{error}</div>}
          </div>
        )}

        {step === 5 && (
          <div className="panel" style={{ marginTop: 16, padding: 14, background: 'var(--ink-2)', borderColor: 'var(--green)', display: 'flex', gap: 10 }}>
            <Icon name="check" size={14} style={{ color: 'var(--green)', marginTop: 1 }} />
            <div style={{ fontSize: 12, color: 'var(--green)' }}>PSN connected! Library syncing…</div>
          </div>
        )}

        {step < 5 && (
          <div className="panel" style={{ marginTop: 18, padding: 12, background: 'var(--ink-2)', display: 'flex', gap: 10 }}>
            <Icon name="shield" size={13} style={{ color: 'var(--green)', marginTop: 1 }} />
            <div className="t-faint" style={{ fontSize: 11, lineHeight: 1.5 }}>
              <span style={{ color: 'var(--paper)' }}>encrypted at rest.</span> we never see your password.
            </div>
          </div>
        )}
      </div>

      {/* sticky footer */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--rule)', display: 'flex', gap: 8, background: 'var(--ink)' }}>
        {step > 1 && step < 5 && (
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
          {saving ? 'saving…' : step === 5 ? 'done →' : step === 4 ? 'save & connect' : 'next →'}
        </Btn>
      </div>
    </MobileFrame>
  );
}
