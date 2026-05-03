export interface ToggleProps {
  on: boolean;
  label?: string;
  sub?: string;
  onChange?: (on: boolean) => void;
  onClick?: () => void;
}

export function Toggle({ on, label, sub, onChange, onClick }: ToggleProps) {
  const handler = onClick ?? (() => onChange?.(!on));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span
        onClick={handler}
        style={{
          position: 'relative',
          width: 36,
          height: 18,
          background: on ? 'var(--green)' : 'var(--ink-2)',
          border: `1px solid ${on ? 'var(--green)' : 'var(--rule-bright)'}`,
          display: 'inline-block',
          cursor: (onClick ?? onChange) ? 'pointer' : 'default',
          flexShrink: 0,
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
      </span>
      {(label || sub) && (
        <div>
          {label && <div style={{ fontSize: 12, color: 'var(--paper)' }}>{label}</div>}
          {sub && <div className="t-faint" style={{ fontSize: 10, marginTop: 2 }}>{sub}</div>}
        </div>
      )}
    </div>
  );
}
