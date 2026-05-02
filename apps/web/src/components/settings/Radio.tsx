export interface RadioProps {
  on: boolean;
  label: string;
  sub?: string;
  onChange?: () => void;
}

export function Radio({ on, label, sub, onChange }: RadioProps) {
  return (
    <div
      onClick={onChange}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', cursor: onChange ? 'pointer' : 'default' }}
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
        <div style={{ fontSize: 12, color: on ? 'var(--paper)' : 'var(--paper-dim)' }}>{label}</div>
        {sub && <div className="t-faint" style={{ fontSize: 10 }}>{sub}</div>}
      </div>
    </div>
  );
}
