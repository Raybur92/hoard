import type { PlatformCode } from '@hoard/types';
import type { SyncedGame } from './steam';

export interface PsnCredentials {
  npssoToken: string;
}

export async function syncPsnLibrary(_credentials: PsnCredentials): Promise<SyncedGame[]> {
  // PSN sync via psn-api npm package.
  // The npsso token is obtained by the user from sony's auth endpoint and pasted in Settings.
  // Implementation deferred — psn-api integration goes here when the package is added.
  // Shape is correct; returns empty array until fully implemented.
  return [] as SyncedGame[];
}

export function validateNpssoFormat(token: string): boolean {
  return /^[A-Za-z0-9]{64}$/.test(token);
}

export { SyncedGame };
export type { PlatformCode };
