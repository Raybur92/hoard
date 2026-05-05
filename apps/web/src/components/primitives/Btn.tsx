import type { CSSProperties, ReactNode } from 'react';

export type BtnVariant = 'primary' | 'amber' | 'green';

export interface BtnProps {
  children: ReactNode;
  variant?: BtnVariant;
  sm?: boolean;
  style?: CSSProperties;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  /** Required when `children` is icon-only (no readable text). */
  ariaLabel?: string;
}

export function Btn({ children, variant, sm, style, onClick, type = 'button', disabled, ariaLabel }: BtnProps) {
  const cls = ['btn', variant ?? '', sm ? 'sm' : ''].filter(Boolean).join(' ');
  return (
    <button className={cls} style={style} onClick={onClick} type={type} disabled={disabled} aria-label={ariaLabel}>
      {children}
    </button>
  );
}
