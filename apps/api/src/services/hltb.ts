import type { IgdbTimeToBeat } from '@hoard/types';

const BASE = 'https://hltbapi.codepotatoes.de';

// Hours → minutes for HLTB community-API responses (which use hours).
function hoursToMinutes(hours: number | null | undefined): number | null {
  if (!hours || hours <= 0) return null;
  return Math.round(hours * 60);
}

// IGDB time_to_beat fields are in seconds.
function secondsToMinutes(seconds: number | null | undefined): number | null {
  if (!seconds || seconds <= 0) return null;
  return Math.round(seconds / 60);
}

export interface HltbResult {
  mainStory: number | null;     // minutes
  mainExtras: number | null;
  completionist: number | null;
  source: 'hltb' | 'igdb';
  // Identifiers captured from the codepotatoes.de payload — used to populate
  // Game.hltbId and Game.gogAppId so we can deep-link the GameDetail HLTB chip
  // and unlock /gog/{id} lookups for future GOG sync.
  hltbId?: number | null;
  gogAppId?: number | null;
}

interface CodepotatoesResponse {
  id?: number;
  hltbId?: number;
  title?: string;
  imageUrl?: string;
  steamAppId?: number;
  gogAppId?: number;
  mainStory?: number;
  mainStoryWithExtras?: number;
  completionist?: number;
  lastUpdatedAt?: string;
}

async function fetchFromCodepotatoes(path: string): Promise<HltbResult | null> {
  try {
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) return null;
    const data = await res.json() as CodepotatoesResponse;
    const mainStory = hoursToMinutes(data.mainStory);
    const mainExtras = hoursToMinutes(data.mainStoryWithExtras);
    const completionist = hoursToMinutes(data.completionist);
    if (mainStory === null && mainExtras === null && completionist === null) return null;
    return {
      mainStory,
      mainExtras,
      completionist,
      source: 'hltb',
      hltbId: data.hltbId ?? null,
      gogAppId: data.gogAppId ?? null,
    };
  } catch {
    return null;
  }
}

export async function fetchHltbBySteamId(steamAppId: number): Promise<HltbResult | null> {
  return fetchFromCodepotatoes(`/steam/${steamAppId}`);
}

export async function fetchHltbByGogId(gogAppId: number): Promise<HltbResult | null> {
  return fetchFromCodepotatoes(`/gog/${gogAppId}`);
}

export async function fetchHltbByHltbId(hltbId: number): Promise<HltbResult | null> {
  return fetchFromCodepotatoes(`/hltb/${hltbId}`);
}

// IGDB time_to_beat as a fallback when the HLTB community API has no Steam-ID
// match. mainStory ← time_to_beat.normally; completionist ← time_to_beat.completely.
// No mainExtras equivalent — left null.
export function igdbTimeToBeatToHltb(t: IgdbTimeToBeat | null): HltbResult | null {
  if (!t) return null;
  const mainStory = secondsToMinutes(t.normally);
  const completionist = secondsToMinutes(t.completely);
  if (mainStory === null && completionist === null) return null;
  return {
    mainStory,
    mainExtras: null,
    completionist,
    source: 'igdb',
  };
}

// Layered fallback used by syncRunner + manual-add + the backfill script:
//   1. /steam/{steamAppId} — direct match for Steam-owned or Steam-Store-mapped games
//   2. IGDB time_to_beat   — for everything else IGDB has data for
// The caller is responsible for any Steam-Store title-search step that
// populates steamAppId before calling this; that lives in the PSN backfill.
export async function fetchHltbWithFallback(
  title: string,
  steamAppId: number | null | undefined,
  igdbTimeToBeat: IgdbTimeToBeat | null,
): Promise<HltbResult | null> {
  if (steamAppId) {
    const hit = await fetchHltbBySteamId(steamAppId);
    if (hit) return hit;
  }
  return igdbTimeToBeatToHltb(igdbTimeToBeat);
}

// Kept for backward compatibility with any older import sites; new code should
// call fetchHltbWithFallback or fetchHltbBySteamId directly.
export async function fetchHltb(_title: string, steamAppId?: number | null): Promise<HltbResult | null> {
  if (steamAppId) return fetchHltbBySteamId(steamAppId);
  return null;
}
