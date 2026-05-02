import type { PlatformCode } from '@hoard/types';

export interface PlatProps {
  code: PlatformCode | string;
  lg?: boolean;
}

export function Plat({ code, lg }: PlatProps) {
  return <span className={`plat${lg ? ' lg' : ''}`}>{code}</span>;
}
