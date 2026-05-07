import { describe, it, expect } from 'vitest';
import { achievementLabel } from '../utils';

describe('achievementLabel (T5 inference rule)', () => {
  it('returns "trophies" when the user has any PSN playtime', () => {
    expect(achievementLabel({ PS: 600 })).toBe('trophies');
    expect(achievementLabel({ PS: 0 })).toBe('trophies');     // present but zero — still a PSN sync entry
    expect(achievementLabel({ PS: 100, ST: 500 })).toBe('trophies'); // dual-platform → "trophies" (Andrea is PSN-heavy)
  });

  it('returns "achievements" for Steam-only games', () => {
    expect(achievementLabel({ ST: 500 })).toBe('achievements');
  });

  it('returns "achievements" for Xbox-only or empty playtime', () => {
    expect(achievementLabel({ XB: 200 })).toBe('achievements');
    expect(achievementLabel({})).toBe('achievements');
  });
});
