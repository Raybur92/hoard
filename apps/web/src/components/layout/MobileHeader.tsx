import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../primitives/Icon';
import { useSearchModal } from '../../hooks/useSearchModal';

export interface MobileHeaderProps {
  title: string;
  sub?: string;
  back?: boolean;
  right?: ReactNode;
  onBack?: () => void;
}

function tickHaptic(): void {
  navigator.vibrate?.(8);
}

export function MobileHeader({ title, sub, back, right, onBack }: MobileHeaderProps) {
  const search = useSearchModal();
  const navigate = useNavigate();

  // Apple HIG: every navigation control needs a real action. When a screen
  // sets `back` but doesn't supply onBack, default to the browser back stack
  // so the caret never reads as decorative — covers the SettingsMobile +
  // PlatformDetailMobile dead-back-button regression flagged by the audit.
  const handleBack = (): void => {
    tickHaptic();
    if (onBack) onBack();
    else navigate(-1);
  };

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
            aria-label="Go back"
            onClick={handleBack}
            className="m-icon-btn"
            style={{
              fontSize: 'var(--text-md)',
              color: 'var(--paper-dim)',
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
          <>
            <button
              type="button"
              onClick={() => { tickHaptic(); search.open(); }}
              aria-label="Search games"
              className="m-icon-btn"
            >
              <Icon name="search" size={18} />
            </button>
            {/* EV-D14 — Settings moved off the bottom tab bar to make room
                for Events. Header cog keeps Settings discoverable globally. */}
            <button
              type="button"
              onClick={() => { tickHaptic(); navigate('/settings'); }}
              aria-label="Settings"
              className="m-icon-btn"
            >
              <Icon name="cog" size={18} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
