import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { MobileFrame } from '../layout/MobileFrame';
import { MobileHeader } from '../layout/MobileHeader';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { Marker } from '../primitives/Marker';
import { api } from '../../lib/api';

const EPIC_STEPS = [
  { n: 1, t: 'open epic login',    d: 'Open the Epic Games sign-in page in a new tab. Hoard never sees your password.' },
  { n: 2, t: 'sign in to epic',    d: 'Use your normal Epic credentials. Epic redirects to a small JSON page.' },
  { n: 3, t: 'copy the code',      d: 'Tap the address bar, copy the URL. The `authorizationCode` is what hoard needs.' },
  { n: 4, t: 'paste into hoard',   d: 'Paste below. Hoard extracts the code automatically.' },
  { n: 5, t: 'all set',             d: "Library sync is running. Epic doesn't expose playtime — games land in Backlog." },
] as const;

function extractCode(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/authorizationCode["\s:=]*([A-Za-z0-9_-]+)/);
  if (match?.[1]) return match[1];
  return trimmed;
}

export function EpicGuidedFlowMobile() {
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
      .catch(() => setAuthUrlError('Failed to load Epic auth URL.'));
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
            ? 'Not signed in — open /login first.'
            : msg.startsWith('400')
              ? 'Epic rejected the code. Codes expire fast — start over from step 1.'
              : 'Server error — check the API is running and try again.',
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
    <MobileFrame>
      <MobileHeader
        title="connect epic"
        sub={`// step ${step} of ${EPIC_STEPS.length}`}
        back
        right={
          <button
            type="button"
            aria-label="Cancel guided flow"
            onClick={() => navigate('/settings/platforms/ep')}
            style={{ background: 'transparent', border: 'none', padding: 8, margin: -8, color: 'inherit', cursor: 'pointer' }}
          >
            <Icon name="x" size={14} />
          </button>
        }
      />

      <div style={{ padding: '12px 16px', display: 'flex', gap: 6, alignItems: 'center', borderBottom: '1px solid var(--rule)' }}>
        {EPIC_STEPS.map((s) => {
          const done = s.n < step, active = s.n === step;
          const c = done ? 'var(--green)' : active ? 'var(--paper)' : 'var(--paper-faint)';
          return (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: s.n < EPIC_STEPS.length ? 'none' : undefined }}>
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
              {s.n < EPIC_STEPS.length && (
                <span style={{ display: 'inline-block', width: 18, height: 1, background: s.n < step ? 'var(--green)' : 'var(--rule)', margin: '0 4px' }} />
              )}
            </div>
          );
        })}
      </div>

      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '16px 16px 20px' }}>
        <Marker>// step {step} · {EPIC_STEPS[step - 1]!.t}</Marker>
        <div style={{ marginTop: 8, fontSize: 'var(--text-md)', lineHeight: 1.25, color: 'var(--paper)' }}>
          {EPIC_STEPS[step - 1]!.t}
        </div>
        <div className="t-faint" style={{ fontSize: 'var(--text-xs)', marginTop: 8, lineHeight: 1.5 }}>
          {EPIC_STEPS[step - 1]!.d}
        </div>

        {step === 1 && (
          <div style={{ marginTop: 14 }}>
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
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)' }}
              >
                <Icon name="ext" size={11} /> open epic login →
              </a>
            ) : (
              <div className="t-faint" style={{ fontSize: 'var(--text-xs)' }}>// loading auth url…</div>
            )}
          </div>
        )}

        {step === 3 && (
          <div style={{ marginTop: 14, border: '1px solid var(--rule-bright)', background: 'var(--ink-2)', padding: 12 }}>
            <div className="t-up t-faint" style={{ fontSize: 'var(--text-2xs)' }}>// the json blob</div>
            <pre className="ascii" style={{ marginTop: 8, fontSize: 'var(--text-2xs)', lineHeight: 1.65, color: 'var(--paper-dim)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {'{ '}<span style={{ color: 'var(--green)' }}>{'"authorizationCode":'}</span>{' '}<span style={{ background: 'var(--green)', color: 'var(--void)', padding: '1px 3px' }}>"aBc123…"</span>{' }'}
            </pre>
          </div>
        )}

        {step === 4 && (
          <div style={{ marginTop: 18 }}>
            <label htmlFor="epic-code-input-mobile" className="t-up t-faint" style={{ fontSize: 'var(--text-2xs)' }}>// paste url, json, or code</label>
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              id="epic-code-input-mobile"
              className="field"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="paste url or code…"
              style={{
                display: 'block', width: '100%', marginTop: 8, height: 38, fontSize: 'var(--text-2xs)',
                fontFamily: 'var(--mono)',
                background: 'var(--ink-2)', border: '1px solid var(--rule-bright)',
                color: 'var(--paper)', padding: '0 12px', outline: 'none',
              }}
            />
            <div className="t-faint" style={{ fontSize: 'var(--text-3xs)', marginTop: 6 }}>
              {code && code !== input.trim() ? `code extracted · ${code.length} chars` : `${code.length} chars · url, json, or bare code all work`}
            </div>
            {error && <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--red)', marginTop: 8 }}>{error}</div>}
          </div>
        )}

        {step === 5 && (
          <div className="panel" style={{ marginTop: 16, padding: 14, background: 'var(--ink-2)', borderColor: 'var(--green)', display: 'flex', gap: 10 }}>
            <Icon name="check" size={14} style={{ color: 'var(--green)', marginTop: 1 }} />
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--green)' }}>Epic connected! Library syncing…</div>
          </div>
        )}

        {step < 5 && (
          <div className="panel" style={{ marginTop: 18, padding: 12, background: 'var(--ink-2)', display: 'flex', gap: 10 }}>
            <Icon name="shield" size={13} style={{ color: 'var(--green)', marginTop: 1 }} />
            <div className="t-faint" style={{ fontSize: 'var(--text-2xs)', lineHeight: 1.5 }}>
              <span style={{ color: 'var(--paper)' }}>encrypted at rest.</span> code is single-use; refresh tokens last 28 days.
            </div>
          </div>
        )}
      </div>

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
          {saving ? 'exchanging…' : step === 5 ? 'done →' : step === 4 ? 'save & connect' : 'next →'}
        </Btn>
      </div>
    </MobileFrame>
  );
}

export default EpicGuidedFlowMobile;
