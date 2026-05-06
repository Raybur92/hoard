import type { ReactNode } from 'react';

export interface SettingsRowProps {
  label: ReactNode;
  hint?: string;
  danger?: boolean;
  children: ReactNode;
}

export function SettingsRow({ label, hint, danger, children }: SettingsRowProps) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '260px 1fr',
      gap: 32,
      padding: '18px 0',
      borderBottom: '1px solid var(--rule)',
      alignItems: 'flex-start',
    }}>
      <div>
        <div style={{ fontSize: 13, color: danger ? 'var(--red)' : 'var(--paper)', fontFamily: 'var(--mono)' }}>
          {label}
        </div>
        {hint && (
          <div className="t-mono t-faint" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>
            {hint}
          </div>
        )}
      </div>
      <div style={{ fontSize: 12 }}>{children}</div>
    </div>
  );
}
