import type { CSSProperties, ReactNode } from 'react';

export interface MarkerProps {
  children: ReactNode;
  style?: CSSProperties;
}

export function Marker({ children, style }: MarkerProps) {
  return <span className="marker" style={style}>{children}</span>;
}
