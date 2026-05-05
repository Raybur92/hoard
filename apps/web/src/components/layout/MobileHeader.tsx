import type { ReactNode } from 'react';
import { Icon } from '../primitives/Icon';

export interface MobileHeaderProps {
  title: string;
  sub?: string;
  back?: boolean;
  right?: ReactNode;
  onBack?: () => void;
}

export function MobileHeader({ title, sub, back, right, onBack }: MobileHeaderProps) {
  return (
    <div style={{
      padding: '8px 16px 14px',
      borderBottom: '1px solid var(--rule)',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      background: 'var(--ink)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        {back && (
          <span
            style={{ fontSize: "var(--text-md)", color: 'var(--paper-dim)', cursor: 'pointer' }}
            onClick={onBack}
          >
            ‹
          </span>
        )}
        <div>
          <div className="t-display" style={{ fontSize: "var(--text-md)", lineHeight: 1, letterSpacing: '0.04em' }}>
            {title}
          </div>
          {sub && (
            <div style={{ fontSize: "var(--text-2xs)", color: 'var(--paper-faint)', textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 4 }}>
              {sub}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, color: 'var(--paper-dim)', fontSize: "var(--text-sm)", alignItems: 'center' }}>
        {right ?? (
          <>
            <Icon name="search" size={14} />
            <Icon name="menu" size={14} />
          </>
        )}
      </div>
    </div>
  );
}
