import type { CSSProperties } from 'react';

export type HrKind = 'dot' | 'dash' | 'solid' | 'double';

export interface HrProps {
  kind?: HrKind;
  style?: CSSProperties;
}

const KIND_CLASS: Record<HrKind, string> = {
  dot:    'hr-dot',
  dash:   'hr-dash',
  solid:  'hr-solid',
  double: 'hr-double',
};

export function Hr({ kind = 'dot', style }: HrProps) {
  return <div className={KIND_CLASS[kind]} style={style} />;
}
