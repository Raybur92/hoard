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

  const lastCrumb = crumbs[crumbs.length - 1];
  return (
    <header className="topbar">
      <nav className="crumbs" aria-label="Breadcrumb">
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          const to = CRUMB_PATHS[c.toLowerCase()];
          return (
            <span key={i}>
              {i > 0 && <span style={{ margin: '0 8px', color: 'var(--paper-ghost)' }} aria-hidden="true">/</span>}
              {isLast
                ? <span aria-current="page" style={{ color: 'var(--paper)', fontWeight: 500 }}>{c}</span>
                : to
                  ? <button type="button" className="crumb-link" onClick={() => navigate(to)}>{c}</button>
                  : <span style={{ color: 'var(--paper-dim)' }}>{c}</span>
              }
            </span>
          );
        })}
      </nav>
      {lastCrumb && <h1 className="sr-only">{lastCrumb}</h1>}
      <div className="right">
        {right ?? (
          <>
            <button
              type="button"
              className="topbar-action"
              onClick={() => search.open()}
              aria-label="Search games (Cmd+K)"
            >
              <Icon name="search" size={12} /> K
            </button>
            {syncedAt && (
              <span style={{ color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="dotO" size={8} fill={true} /> {syncedAt}
              </span>
            )}
            <button
              type="button"
              className="topbar-action"
              onClick={() => navigate('/settings')}
              aria-label="Settings"
            >
              <Icon name="cog" size={13} />
            </button>
          </>
        )}
      </div>
    </header>
  );
}

export const TopBar = memo(TopBarImpl);
