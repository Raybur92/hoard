import type { ReactNode } from 'react';

export interface MobileFrameProps {
  children: ReactNode;
}

export function MobileFrame({ children }: MobileFrameProps) {
  return <div className="app-mobile">{children}</div>;
}
