export interface RadioProps {
  on: boolean;
  label: string;
  sub?: string;
  onChange?: () => void;
  onClick?: () => void;
  name?: string;
}

export function Radio({ on, label, sub, onChange, onClick, name }: RadioProps) {
  const handler = onClick ?? onChange;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={handler}
      disabled={!handler}
      data-name={name}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 0',
        cursor: handler ? 'pointer' : 'default',
        background: 'transparent',
        border: 'none',
        textAlign: 'left',
        color: 'inherit',
        font: 'inherit',
        width: '100%',
      }}
    >
      <span style={{
        width: 12,
        height: 12,
        border: '1px solid var(--rule-bright)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        {on && <span style={{ width: 6, height: 6, background: 'var(--green)' }} />}
      </span>
      <div>
        <div style={{ fontSize: 'var(--text-xs)', color: on ? 'var(--paper)' : 'var(--paper-dim)' }}>{label}</div>
        {sub && <div style={{ color: 'var(--paper-dim)', fontSize: 'var(--text-2xs)' }}>{sub}</div>}
      </div>
    </button>
  );
}
