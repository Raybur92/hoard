import type { CSSProperties } from 'react';

export const ICON_PATHS = {
  star:    'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.8 6.6 19.5l1.2-6L3.3 9.3l6.1-.7L12 3z',
  starF:   'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.8 6.6 19.5l1.2-6L3.3 9.3l6.1-.7L12 3z',
  play:    'M6 4l14 8-14 8V4z',
  bell:    'M6 16V11a6 6 0 1 1 12 0v5l1.5 2H4.5L6 16zM10 21h4',
  plus:    'M12 5v14M5 12h14',
  cmd:     'M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6z',
  cog:     'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  arrowR:  'M5 12h14M13 6l6 6-6 6',
  arrowD:  'M12 5v14M6 13l6 6 6-6',
  search:  'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5.2-5.2',
  menu:    'M4 7h16M4 12h16M4 17h16',
  check:   'M5 12l5 5 9-11',
  x:       'M6 6l12 12M18 6l-12 12',
  pause:   'M8 5v14M16 5v14',
  circle:  'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  dotO:    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  back:    'M15 6l-6 6 6 6',
  caret:   'M6 9l6 6 6-6',
  battery: 'M3 8h15v8H3zM18 11v2h2v-2h-2zM5 10h11v4H5z',
  bolt:    'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
} as const;

export type IconName = keyof typeof ICON_PATHS;

export interface IconProps {
  name: IconName;
  size?: number;
  fill?: boolean | string;
  stroke?: string;
  sw?: number;
  style?: CSSProperties;
  className?: string;
}

export function Icon({ name, size = 14, fill, stroke = 'currentColor', sw = 1.5, style, className }: IconProps) {
  const d = ICON_PATHS[name];
  const filled = fill === true || name === 'starF';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? (typeof fill === 'string' ? fill : 'currentColor') : 'none'}
      stroke={filled && fill === true ? 'none' : stroke}
      strokeWidth={sw}
      strokeLinecap="square"
      strokeLinejoin="miter"
      style={{ display: 'inline-block', verticalAlign: '-0.15em', flex: '0 0 auto', ...style }}
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
