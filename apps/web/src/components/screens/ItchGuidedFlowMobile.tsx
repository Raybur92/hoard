import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { MobileFrame } from '../layout/MobileFrame';
import { MobileHeader } from '../layout/MobileHeader';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { Marker } from '../primitives/Marker';
import { api } from '../../lib/api';

const ITCH_STEPS = [
  { n: 1, t: 'open itch.io api keys',  d: 'Open your itch.io API keys page in a new tab. The key is a read-only credential.' },
  { n: 2, t: 'generate + copy a key',  d: 'Tap "Generate new API key" (or use an existing one) and copy the whole token.' },
  { n: 3, t: 'paste into hoard',        d: 'Paste below. Hoard validates against itch.io before saving.' },
  { n: 4, t: 'all set',                 d: 'Library is syncing. itch.io has no playtime — games land in Backlog.' },
] as const;

const ITCH_API_KEYS_URL = 'https://itch.io/user/settings/api-keys';

export function ItchGuidedFlowMobile() {
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
            ? 'Not signed in — open /login first.'
            : msg.startsWith('400')
              ? 'itch.io rejected the key. Generate a fresh one and try again.'
              : 'Server error — check the API is running and try again.',
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
    <MobileFrame>
      <MobileHeader
        title="connect itch.io"
        sub={`// step ${step} of ${ITCH_STEPS.length}`}
        back
        right={
          <button
            type="button"
            aria-label="Cancel guided flow"
            onClick={() => navigate('/settings/platforms/it')}
            style={{ background: 'transparent', border: 'none', padding: 8, margin: -8, color: 'inherit', cursor: 'pointer' }}
          >
            <Icon name="x" size={14} />
          </button>
        }
      />

      {/* compact stepper dots */}
      <div style={{ padding: '12px 16px', display: 'flex', gap: 6, alignItems: 'center', borderBottom: '1px solid var(--rule)' }}>
        {ITCH_STEPS.map((s) => {
          const done = s.n < step, active = s.n === step;
          const c = done ? 'var(--green)' : active ? 'var(--paper)' : 'var(--paper-faint)';
          return (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: s.n < ITCH_STEPS.length ? 'none' : undefined }}>
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
              {s.n < ITCH_STEPS.length && (
                <span style={{ display: 'inline-block', width: 20, height: 1, background: s.n < step ? 'var(--green)' : 'var(--rule)', margin: '0 4px' }} />
              )}
            </div>
          );
        })}
      </div>

      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '16px 16px 20px' }}>
        <Marker>// step {step} · {ITCH_STEPS[step - 1]!.t}</Marker>
        <div style={{ marginTop: 8, fontSize: 'var(--text-md)', lineHeight: 1.25, color: 'var(--paper)' }}>
          {ITCH_STEPS[step - 1]!.t}
        </div>
        <div className="t-faint" style={{ fontSize: 'var(--text-xs)', marginTop: 8, lineHeight: 1.5 }}>
          {ITCH_STEPS[step - 1]!.d}
        </div>

        {step === 1 && (
          <div style={{ marginTop: 14 }}>
            <a
              href={ITCH_API_KEYS_URL}
              target="_blank"
              rel="noreferrer"
              className="btn primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)' }}
            >
              <Icon name="ext" size={11} /> open itch.io api keys →
            </a>
          </div>
        )}

        {step === 3 && (
          <div style={{ marginTop: 18 }}>
            <label htmlFor="itch-key-input-mobile" className="t-up t-faint" style={{ fontSize: 'var(--text-2xs)' }}>// paste api key</label>
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              id="itch-key-input-mobile"
              className="field"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="paste your itch.io api key…"
              style={{
                display: 'block', width: '100%', marginTop: 8, height: 38, fontSize: 'var(--text-2xs)',
                fontFamily: 'var(--mono)',
                background: 'var(--ink-2)', border: '1px solid var(--rule-bright)',
                color: 'var(--paper)', padding: '0 12px', outline: 'none',
              }}
            />
            <div className="t-faint" style={{ fontSize: 'var(--text-3xs)', marginTop: 6 }}>
              {trimmedKey.length} chars · validated against itch.io before save
            </div>
            {error && <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--red)', marginTop: 8 }}>{error}</div>}
          </div>
        )}

        {step === 4 && (
          <div className="panel" style={{ marginTop: 16, padding: 14, background: 'var(--ink-2)', borderColor: 'var(--green)', display: 'flex', gap: 10 }}>
            <Icon name="check" size={14} style={{ color: 'var(--green)', marginTop: 1 }} />
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--green)' }}>itch.io connected! Library syncing…</div>
          </div>
        )}

        {step < 4 && (
          <div className="panel" style={{ marginTop: 18, padding: 12, background: 'var(--ink-2)', display: 'flex', gap: 10 }}>
            <Icon name="shield" size={13} style={{ color: 'var(--green)', marginTop: 1 }} />
            <div className="t-faint" style={{ fontSize: 'var(--text-2xs)', lineHeight: 1.5 }}>
              <span style={{ color: 'var(--paper)' }}>read-only access.</span> revoke from itch.io settings any time.
            </div>
          </div>
        )}
      </div>

      {/* sticky footer */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--rule)', display: 'flex', gap: 8, background: 'var(--ink)' }}>
        {step > 1 && step < 4 && (
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
          {saving ? 'validating…' : step === 4 ? 'done →' : step === 3 ? 'save & connect' : 'next →'}
        </Btn>
      </div>
    </MobileFrame>
  );
}

export default ItchGuidedFlowMobile;
