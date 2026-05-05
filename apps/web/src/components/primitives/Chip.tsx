import type { CSSProperties, ReactNode } from 'react';

export type ChipTone = 'amber' | 'green' | 'red';

export interface ChipProps {
  children: ReactNode;
  on?: boolean;
  tone?: ChipTone;
  solid?: boolean;
  style?: CSSProperties;
  onClick?: () => void;
  /** When true and onClick is set, renders as <button aria-pressed={on}>. Default true. */
  pressed?: boolean;
  ariaLabel?: string;
}

export function Chip({ children, on, tone, solid, style, onClick, pressed = true, ariaLabel }: ChipProps) {
  const cls = ['chip', on ? 'on' : '', tone ?? '', solid ? 'solid' : '']
    .filter(Boolean)
    .join(' ');
  if (onClick) {
    return (
      <button
        type="button"
        className={cls}
        style={style}
        onClick={onClick}
        aria-pressed={pressed ? on ?? false : undefined}
        aria-label={ariaLabel}
      >
        {children}
      </button>
    );
  }
  return (
    <span className={cls} style={style}>
      {children}
    </span>
  );
}
