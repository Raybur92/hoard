const BASE = 'https://hltbapi.codepotatoes.de';

export interface HltbResult {
  mainStory: number | null;    // minutes
  mainExtras: number | null;
  completionist: number | null;
}

function hoursToMinutes(hours: number | null | undefined): number | null {
  if (!hours || hours <= 0) return null;
  return Math.round(hours * 60);
}

export async function fetchHltbBySteamId(steamAppId: number): Promise<HltbResult | null> {
  try {
    const res = await fetch(`${BASE}/steam/${steamAppId}`);
    if (!res.ok) return null;
    const data = await res.json() as {
      mainStory?: number;
      mainStoryWithExtras?: number;
      completionist?: number;
    };
    return {
      mainStory: hoursToMinutes(data.mainStory),
      mainExtras: hoursToMinutes(data.mainStoryWithExtras),
      completionist: hoursToMinutes(data.completionist),
    };
  } catch {
    return null;
  }
}

export async function fetchHltb(title: string, steamAppId?: number | null): Promise<HltbResult | null> {
  if (steamAppId) return fetchHltbBySteamId(steamAppId);
  // No ID-based fallback available — HLTB's public search API requires a bot-protected key
  return null;
}
