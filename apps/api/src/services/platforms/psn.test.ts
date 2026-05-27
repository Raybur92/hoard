// Focused unit tests for getPsnUsername — the PSN service's other
// exports (syncPsnLibrary, getPsnTrophyTitles) are exercised via the
// platforms.test.ts route-level + trophies.test.ts orchestrator paths.

jest.mock('psn-api', () => ({
  exchangeNpssoForCode: jest.fn(),
  exchangeCodeForAccessToken: jest.fn(),
  getProfileFromUserName: jest.fn(),
  // syncPsnLibrary + getPsnTrophyTitles also import these but the
  // getPsnUsername-only tests below don't exercise them.
  getUserPlayedGames: jest.fn(),
  getUserTitles: jest.fn(),
}));

import { getPsnUsername } from './psn';
import {
  exchangeNpssoForCode,
  exchangeCodeForAccessToken,
  getProfileFromUserName,
} from 'psn-api';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('getPsnUsername', () => {
  it('runs the npsso → access-code → access-token → profile dance and returns onlineId', async () => {
    (exchangeNpssoForCode as jest.Mock).mockResolvedValue('access-code-x');
    (exchangeCodeForAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'access-token-x' });
    (getProfileFromUserName as jest.Mock).mockResolvedValue({
      profile: { onlineId: 'Raybur92', accountId: '123' },
    });

    const r = await getPsnUsername('a'.repeat(64));

    expect(r).toBe('Raybur92');
    expect(exchangeNpssoForCode).toHaveBeenCalledWith('a'.repeat(64));
    expect(getProfileFromUserName).toHaveBeenCalledWith({ accessToken: 'access-token-x' }, 'me');
  });

  it('returns null when the npsso exchange throws (bad/expired token)', async () => {
    (exchangeNpssoForCode as jest.Mock).mockRejectedValue(new Error('NPSSO expired'));
    expect(await getPsnUsername('bad-token')).toBeNull();
  });

  it('returns null when the profile fetch throws (PSN downtime / private profile)', async () => {
    (exchangeNpssoForCode as jest.Mock).mockResolvedValue('access-code-x');
    (exchangeCodeForAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'access-token-x' });
    (getProfileFromUserName as jest.Mock).mockRejectedValue(new Error('PSN 503'));
    expect(await getPsnUsername('a'.repeat(64))).toBeNull();
  });

  it('returns null on empty token (short-circuit, no exchange call)', async () => {
    expect(await getPsnUsername('')).toBeNull();
    expect(exchangeNpssoForCode).not.toHaveBeenCalled();
  });

  it('returns null when the profile response lacks onlineId', async () => {
    (exchangeNpssoForCode as jest.Mock).mockResolvedValue('access-code-x');
    (exchangeCodeForAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'access-token-x' });
    (getProfileFromUserName as jest.Mock).mockResolvedValue({ profile: { accountId: '123' } });
    expect(await getPsnUsername('a'.repeat(64))).toBeNull();
  });
});
