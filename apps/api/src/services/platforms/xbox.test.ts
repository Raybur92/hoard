import { syncXboxLibrary } from './xbox';

beforeEach(() => {
  global.fetch = jest.fn() as typeof global.fetch;
});

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function notOk(status = 500): Response {
  return { ok: false, status, json: async () => ({}) } as unknown as Response;
}

describe('syncXboxLibrary', () => {
  it('maps OpenXBL titleHistory entries to SyncedGame[] with platformCode=XB', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({
        titles: [
          {
            titleId: 'TID-1',
            name: 'Halo Infinite',
            lastTimePlayed: '2026-04-01T12:00:00Z',
          },
          {
            titleId: 'TID-2',
            name: 'Forza Horizon 5',
            lastTimePlayed: '2026-03-15T08:30:00Z',
          },
        ],
      }),
    );

    const out = await syncXboxLibrary({ apiKey: 'fake-key' });

    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      igdbSearchTitle: 'Halo Infinite',
      platformCode: 'XB',
      playtimeMinutes: 0,
      lastPlayedAt: new Date('2026-04-01T12:00:00Z'),
      hasBeenPlayed: true,
    });
    expect(out[1]?.igdbSearchTitle).toBe('Forza Horizon 5');
  });

  it('sets hasBeenPlayed=false when lastTimePlayed is missing or null (game owned but never launched)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({
        titles: [
          { titleId: 'TID-3', name: 'Untouched Game', lastTimePlayed: null },
          { titleId: 'TID-4', name: 'Another Untouched Game' /* no lastTimePlayed */ },
        ],
      }),
    );

    const out = await syncXboxLibrary({ apiKey: 'fake-key' });

    expect(out).toHaveLength(2);
    expect(out[0]?.hasBeenPlayed).toBe(false);
    expect(out[0]?.lastPlayedAt).toBeNull();
    expect(out[1]?.hasBeenPlayed).toBe(false);
    expect(out[1]?.lastPlayedAt).toBeNull();
  });

  it('drops titles missing the `name` field (defensive — without it we can\'t IGDB-match)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({
        titles: [
          { titleId: 'TID-5', name: 'Valid Game', lastTimePlayed: '2026-01-01T00:00:00Z' },
          { titleId: 'TID-6' /* no name */ },
          { titleId: 'TID-7', name: '' /* empty name */ },
        ],
      }),
    );

    const out = await syncXboxLibrary({ apiKey: 'fake-key' });
    expect(out).toHaveLength(1);
    expect(out[0]?.igdbSearchTitle).toBe('Valid Game');
  });

  it('returns [] when OpenXBL responds with no `titles` field', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(ok({}));
    expect(await syncXboxLibrary({ apiKey: 'fake-key' })).toEqual([]);
  });

  it('returns [] when titles is an empty array', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(ok({ titles: [] }));
    expect(await syncXboxLibrary({ apiKey: 'fake-key' })).toEqual([]);
  });

  it('passes the API key as X-Authorization header (not Authorization)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(ok({ titles: [] }));
    await syncXboxLibrary({ apiKey: 'my-secret-key' });
    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(call[0]).toBe('https://xbl.io/api/v2/player/titleHistory');
    expect((call[1] as RequestInit).headers).toEqual(
      expect.objectContaining({ 'X-Authorization': 'my-secret-key' }),
    );
  });

  it('throws when the API key is missing or empty', async () => {
    await expect(syncXboxLibrary({ apiKey: '' })).rejects.toThrow(/api key missing/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('throws on a non-2xx HTTP response (the sync orchestrator catches + logs)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(notOk(401));
    await expect(syncXboxLibrary({ apiKey: 'fake-key' })).rejects.toThrow(/401/);
  });

  it('throws on a network error (fetch rejects)', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNRESET'));
    await expect(syncXboxLibrary({ apiKey: 'fake-key' })).rejects.toThrow(/network error/i);
  });

  it('throws on malformed JSON (the orchestrator catches + logs)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new Error('Unexpected token'); },
    } as unknown as Response);
    await expect(syncXboxLibrary({ apiKey: 'fake-key' })).rejects.toThrow(/malformed/i);
  });
});
