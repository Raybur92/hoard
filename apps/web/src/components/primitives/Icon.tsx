import type { CSSProperties } from 'react';

export const ICON_PATHS = {
  star:     'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.8 6.6 19.5l1.2-6L3.3 9.3l6.1-.7L12 3z',
  starF:    'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.8 6.6 19.5l1.2-6L3.3 9.3l6.1-.7L12 3z',
  play:     'M6 4l14 8-14 8V4z',
  bell:     'M6 16V11a6 6 0 1 1 12 0v5l1.5 2H4.5L6 16zM10 21h4',
  plus:     'M12 5v14M5 12h14',
  cmd:      'M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6z',
  cog:      'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  arrowR:   'M5 12h14M13 6l6 6-6 6',
  arrowD:   'M12 5v14M6 13l6 6 6-6',
  search:   'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5.2-5.2',
  menu:     'M4 7h16M4 12h16M4 17h16',
  check:    'M5 12l5 5 9-11',
  x:        'M6 6l12 12M18 6l-12 12',
  pause:    'M8 5v14M16 5v14',
  circle:   'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  dotO:     'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  back:     'M15 6l-6 6 6 6',
  caret:    'M6 9l6 6 6-6',
  battery:  'M3 8h15v8H3zM18 11v2h2v-2h-2zM5 10h11v4H5z',
  bolt:     'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
  ext:      'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3',
  user:     'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  link:     'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  shield:   'M12 3L4 7v6c0 5.25 3.57 9.84 8 11 4.43-1.16 8-5.75 8-11V7l-8-4z',
  warn:     'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  refresh:  'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  info:     'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8h.01M12 12v4',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  trash:    'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  copy:     'M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M16 4h2a2 2 0 0 1 2 2v4M14 2h-4a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z',
  key:      'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
  eye:      'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  clip:     'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z',
  home:     'M3 12L12 4l9 8M5 11v9h14v-9',
  rows:     'M3 7h12M3 12h18M3 17h15',
  clock:    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
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
