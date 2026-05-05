import { memo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../primitives/Icon';
import { useSearchModal } from '../../hooks/useSearchModal';

export interface TopBarProps {
  crumbs?: string[];
  right?: ReactNode;
  syncedAt?: string | null;
}

const CRUMB_PATHS: Record<string, string> = {
  hoard:     '/',
  dashboard: '/',
  library:   '/library',
  upcoming:  '/upcoming',
  settings:  '/settings',
  platforms: '/settings/platforms',
};

function TopBarImpl({ crumbs = [], right, syncedAt }: TopBarProps) {
  const navigate = useNavigate();
  const search = useSearchModal();

  return (
    <div className="topbar">
      <span className="crumbs">
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          const to = CRUMB_PATHS[c.toLowerCase()];
          return (
            <span key={i}>
              {i > 0 && <span style={{ margin: '0 8px', color: 'var(--paper-ghost)' }}>/</span>}
              {isLast
                ? <b>{c}</b>
                : to
                  ? <span style={{ cursor: 'pointer', color: 'var(--paper-dim)' }} onClick={() => navigate(to)}>{c}</span>
                  : <span style={{ color: 'var(--paper-dim)' }}>{c}</span>
              }
            </span>
          );
        })}
      </span>
      <div className="right">
        {right ?? (
          <>
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              onClick={() => search.open()}
            >
              <Icon name="search" size={12} /> K
            </span>
            {syncedAt && (
              <span style={{ color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="dotO" size={8} fill={true} /> {syncedAt}
              </span>
            )}
            <span style={{ display: 'inline-flex', cursor: 'pointer' }} onClick={() => navigate('/settings')}>
              <Icon name="cog" size={13} />
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export const TopBar = memo(TopBarImpl);
