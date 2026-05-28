import { validateItchApiKey, getItchUsername, syncItchLibrary } from './itch';

beforeEach(() => {
  jest.resetAllMocks();
  global.fetch = jest.fn() as typeof global.fetch;
});

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function notOk(status = 401, body: unknown = {}): Response {
  return { ok: false, status, json: async () => body } as unknown as Response;
}

/* ── validateItchApiKey ── */

describe('validateItchApiKey', () => {
  it('returns true on a 200 response with a user field', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({ user: { id: 42, username: 'andrea', display_name: 'Andrea' } }),
    );
    expect(await validateItchApiKey('a-real-looking-key-with-enough-chars')).toBe(true);
  });

  it('returns false when itch.io returns an errors array (invalid key)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({ errors: ['invalid key'] }),
    );
    expect(await validateItchApiKey('looks-real-but-isnt')).toBe(false);
  });

  it('returns false on a 401/403 response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(notOk(401));
    expect(await validateItchApiKey('looks-real-but-isnt')).toBe(false);
  });

  it('returns false on a network error (fetch throws)', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNRESET'));
    expect(await validateItchApiKey('looks-real-but-isnt')).toBe(false);
  });

  it('rejects short keys without hitting the network', async () => {
    expect(await validateItchApiKey('')).toBe(false);
    expect(await validateItchApiKey('short')).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

/* ── getItchUsername ── */

describe('getItchUsername', () => {
  it('returns display_name when set (preferred over username)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({ user: { id: 42, username: 'andrea-cama', display_name: 'Andrea' } }),
    );
    expect(await getItchUsername('any-key-ok-here')).toBe('Andrea');
  });

  it('falls back to username when display_name is missing', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({ user: { id: 42, username: 'andrea-cama' } }),
    );
    expect(await getItchUsername('any-key-ok-here')).toBe('andrea-cama');
  });

  it('returns null on auth failure / malformed response / network error', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(notOk(401));
    expect(await getItchUsername('any-key-ok-here')).toBeNull();

    (global.fetch as jest.Mock).mockResolvedValue(ok({ /* no user */ }));
    expect(await getItchUsername('any-key-ok-here')).toBeNull();

    (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNRESET'));
    expect(await getItchUsername('any-key-ok-here')).toBeNull();
  });
});

/* ── syncItchLibrary ── */

describe('syncItchLibrary', () => {
  it('paginates through /my-owned-keys until an empty page', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(ok({
        owned_keys: [
          { id: 1, game: { id: 1001, title: 'Game A', url: 'https://creator.itch.io/game-a' } },
          { id: 2, game: { id: 1002, title: 'Game B' } },
        ],
      }))
      .mockResolvedValueOnce(ok({
        owned_keys: [
          { id: 3, game: { id: 1003, title: 'Game C', url: 'https://creator.itch.io/game-c' } },
        ],
      }))
      .mockResolvedValueOnce(ok({ owned_keys: [] }));

    const result = await syncItchLibrary({ apiKey: 'a-real-looking-key' });

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      igdbSearchTitle: 'Game A',
      itchGameId: 1001,
      itchUrl: 'https://creator.itch.io/game-a',
      platformCode: 'IT',
      playtimeMinutes: 0,
      lastPlayedAt: null,
    });
    expect(result[1]).toEqual({
      igdbSearchTitle: 'Game B',
      itchGameId: 1002,
      platformCode: 'IT',
      playtimeMinutes: 0,
      lastPlayedAt: null,
    });
    expect(result[2]?.igdbSearchTitle).toBe('Game C');
  });

  it('filters out keys without a game subdoc or with missing title/id', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(ok({
        owned_keys: [
          { id: 1, game: { id: 1001, title: 'Valid' } },
          { id: 2 }, // no game
          { id: 3, game: { id: 1003 } }, // missing title
          { id: 4, game: { title: 'Missing id' } }, // missing id
          { id: 5, game: { id: 1005, title: '' } }, // empty title
        ],
      }))
      .mockResolvedValueOnce(ok({ owned_keys: [] }));

    const result = await syncItchLibrary({ apiKey: 'a-real-looking-key' });

    expect(result).toHaveLength(1);
    expect(result[0]?.itchGameId).toBe(1001);
  });

  it('throws on a 401 (revoked key) so the orchestrator can log sync.error', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(notOk(401));
    await expect(syncItchLibrary({ apiKey: 'a-real-looking-key' })).rejects.toThrow(/401\/403/);
  });

  it('throws when missing apiKey (defensive guard)', async () => {
    await expect(syncItchLibrary({ apiKey: '' })).rejects.toThrow(/API key missing/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('throws when itch.io returns an errors array in the body', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({ errors: ['quota exceeded'] }),
    );
    await expect(syncItchLibrary({ apiKey: 'a-real-looking-key' })).rejects.toThrow(/quota exceeded/);
  });
});
