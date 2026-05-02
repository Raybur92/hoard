import type { SyncedGame } from './steam';

export interface XboxCredentials {
  openXblApiKey: string;
  xuid?: string;
}

export async function syncXboxLibrary(_credentials: XboxCredentials): Promise<SyncedGame[]> {
  // Xbox sync via OpenXBL API (openxbl.com).
  // Requires the user's OpenXBL API key.
  // Implementation deferred — validate free-tier coverage before implementing.
  return [] as SyncedGame[];
}

export { SyncedGame };
