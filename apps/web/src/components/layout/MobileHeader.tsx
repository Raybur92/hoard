import type { ReactNode } from 'react';
import { Icon } from '../primitives/Icon';
import { useSearchModal } from '../../hooks/useSearchModal';

export interface MobileHeaderProps {
  title: string;
  sub?: string;
  back?: boolean;
  right?: ReactNode;
  onBack?: () => void;
}

export function MobileHeader({ title, sub, back, right, onBack }: MobileHeaderProps) {
  const search = useSearchModal();

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
          <button
            type="button"
            aria-label="Back"
            onClick={onBack}
            style={{
              fontSize: 'var(--text-md)',
              color: 'var(--paper-dim)',
              background: 'transparent',
              border: 'none',
              padding: 8,
              margin: -8,
              cursor: 'pointer',
              fontFamily: 'inherit',
              lineHeight: 1,
            }}
          >
            ‹
          </button>
        )}
        <div>
          <h1 className="t-display" style={{ fontSize: "var(--text-md)", lineHeight: 1, letterSpacing: '0.04em', margin: 0, fontWeight: 'normal' }}>
            {title}
          </h1>
          {sub && (
            <div style={{ fontSize: "var(--text-2xs)", color: 'var(--paper-dim)', textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 4 }}>
              {sub}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, color: 'var(--paper-dim)', fontSize: "var(--text-sm)", alignItems: 'center' }}>
        {right ?? (
          <button
            type="button"
            onClick={() => search.open()}
            aria-label="Search games"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 8,
              margin: -8,
              color: 'inherit',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <Icon name="search" size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
