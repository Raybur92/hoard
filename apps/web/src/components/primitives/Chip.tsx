import type { CSSProperties, ReactNode } from 'react';

export type ChipTone = 'amber' | 'green' | 'red';

export interface ChipProps {
  children: ReactNode;
  on?: boolean;
  tone?: ChipTone;
  solid?: boolean;
  style?: CSSProperties;
  onClick?: () => void;
}

export function Chip({ children, on, tone, solid, style, onClick }: ChipProps) {
  const cls = ['chip', on ? 'on' : '', tone ?? '', solid ? 'solid' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <span className={cls} style={style} onClick={onClick} role={onClick ? 'button' : undefined}>
      {children}
    </span>
  );
}
