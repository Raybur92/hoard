import type { CSSProperties, ReactNode } from 'react';

export interface MarkerProps {
  children: ReactNode;
  style?: CSSProperties;
  /** Extra class(es) appended to the base `marker` class. Used by the
   *  events surface for the `events-live-pulse` keyframe on LIVE markers. */
  className?: string;
}

export function Marker({ children, style, className }: MarkerProps) {
  const cls = className ? `marker ${className}` : 'marker';
  return <span className={cls} style={style}>{children}</span>;
}
