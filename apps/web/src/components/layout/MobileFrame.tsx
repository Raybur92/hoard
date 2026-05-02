import type { ReactNode } from 'react';
import { Icon } from '../primitives/Icon';

export interface MobileFrameProps {
  children: ReactNode;
}

export function MobileFrame({ children }: MobileFrameProps) {
  return (
    <div className="app-mobile">
      <div className="m-status">
        <span>9:41</span>
        <span style={{ color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Icon name="dotO" size={7} fill={true} /> HOARD
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name="battery" size={14} /> 100%
        </span>
      </div>
      {children}
    </div>
  );
}
