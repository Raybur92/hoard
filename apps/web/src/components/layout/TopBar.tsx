import type { ReactNode } from 'react';
import { Icon } from '../primitives/Icon';

export interface TopBarProps {
  crumbs?: string[];
  right?: ReactNode;
  syncedAt?: string | null;
}

export function TopBar({ crumbs = [], right, syncedAt }: TopBarProps) {
  return (
    <div className="topbar">
      <span className="crumbs">
        {crumbs.map((c, i) => (
          <span key={i}>
            {i > 0 && <span style={{ margin: '0 8px', color: 'var(--paper-ghost)' }}>/</span>}
            {i === crumbs.length - 1 ? <b>{c}</b> : <span>{c}</span>}
          </span>
        ))}
      </span>
      <div className="right">
        {right ?? (
          <>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="search" size={12} /> K
            </span>
            {syncedAt && (
              <span style={{ color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="dotO" size={8} fill={true} /> {syncedAt}
              </span>
            )}
            <span style={{ display: 'inline-flex', cursor: 'pointer' }}>
              <Icon name="cog" size={13} />
            </span>
          </>
        )}
      </div>
    </div>
  );
}
