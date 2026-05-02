import { HowLongToBeatService } from 'howlongtobeat';

const hltbService = new HowLongToBeatService();

export interface HltbResult {
  mainStory: number | null;    // minutes
  mainExtras: number | null;
  completionist: number | null;
}

function hoursToMinutes(hours: number): number | null {
  return hours > 0 ? Math.round(hours * 60) : null;
}

export async function fetchHltb(title: string): Promise<HltbResult | null> {
  try {
    const results = await hltbService.search(title);
    if (!results || results.length === 0) return null;

    // Results are sorted by similarity — take the best match
    const best = results[0];
    if (!best) return null;

    return {
      mainStory: hoursToMinutes(best.gameplayMain),
      mainExtras: hoursToMinutes(best.gameplayMainExtra),
      completionist: hoursToMinutes(best.gameplayCompletionist),
    };
  } catch {
    // Rule 8: HLTB failures must be silent
    return null;
  }
}
