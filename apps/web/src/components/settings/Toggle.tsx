export interface ToggleProps {
  on: boolean;
  label?: string;
  sub?: string;
  onChange?: (on: boolean) => void;
  onClick?: () => void;
  /** Optional aria-label when no visible label is provided. */
  ariaLabel?: string;
}

export function Toggle({ on, label, sub, onChange, onClick, ariaLabel }: ToggleProps) {
  const handler = onClick ?? (() => onChange?.(!on));
  const interactive = !!(onClick ?? onChange);
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: interactive ? 'pointer' : 'default' }}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={!label ? ariaLabel : undefined}
        onClick={handler}
        disabled={!interactive}
        style={{
          position: 'relative',
          width: 36,
          height: 18,
          background: on ? 'var(--green)' : 'var(--ink-2)',
          border: `1px solid ${on ? 'var(--green)' : 'var(--rule-bright)'}`,
          padding: 0,
          flexShrink: 0,
          cursor: interactive ? 'pointer' : 'default',
        }}
      >
        <span style={{
          position: 'absolute',
          top: 1,
          left: on ? 19 : 1,
          width: 14,
          height: 14,
          background: on ? 'var(--void)' : 'var(--paper-dim)',
          transition: 'left 0.1s',
        }} />
      </button>
      {(label || sub) && (
        <div>
          {label && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--paper)' }}>{label}</div>}
          {sub && <div style={{ color: 'var(--paper-dim)', fontSize: 'var(--text-2xs)', marginTop: 2 }}>{sub}</div>}
        </div>
      )}
    </label>
  );
}
