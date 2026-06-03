// EV-PR1 — backend tests for /api/events* routes + admin sync.
//
// Strategy mirrors feedback.test.ts: middleware mocked at module level,
// Prisma mocked at module level (Rule 7), services/events mocked so we
// can control sync behaviour without IGDB network calls.

jest.mock('dotenv/config', () => ({}));

import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';

jest.mock('@hoard/db', () => ({
  prisma: {
    event: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    eventGame: {
      findMany: jest.fn(),
    },
    userGame: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../middleware/user', () => ({
  requireUser: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { userId: string }).userId = 'user-1';
    next();
  },
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { userId: string }).userId = 'user-1';
    next();
  },
}));

jest.mock('../middleware/active', () => ({
  requireActive: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: { id: string; status: 'ACTIVE'; isAdmin: boolean } }).user = {
      id: 'user-1', status: 'ACTIVE', isAdmin: true, // admin so /admin/* doesn't 404
    };
    next();
  },
}));

jest.mock('../middleware/admin', () => ({
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

jest.mock('../services/events', () => {
  const actual = jest.requireActual('../services/events');
  return {
    ...actual,
    syncSingleEventBySlug: jest.fn(),
    syncAllEvents: jest.fn(),
    resolveEventGames: jest.fn(),
  };
});

import { app } from '../index';
import { prisma } from '@hoard/db';
import { syncSingleEventBySlug, syncAllEvents, resolveEventGames } from '../services/events';

beforeEach(() => {
  jest.resetAllMocks();
});

/* ── Fixtures ─────────────────────────────────────────────────────────── */

const NOW = new Date('2026-06-12T18:00:00Z');

function fakeEventRow(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'state-of-play-2026-06',
    name: 'State of Play — June 2026',
    description: 'Sony showcase',
    startTime: new Date('2026-06-15T22:00:00Z'),
    endTime: new Date('2026-06-15T23:00:00Z'),
    liveStreamUrl: 'https://www.youtube.com/watch?v=abc',
    timeZone: 'America/Los_Angeles',
    logoUrl: 'https://images.igdb.com/igdb/image/upload/t_logo_med/sop.jpg',
    networks: [{ name: 'YouTube', type: 'YouTube', url: 'https://youtube.com' }],
    videos: [],
    gamesResolvedAt: new Date('2026-06-01T00:00:00Z'),
    _count: { games: 5 },
    ...overrides,
  };
}

/* ── GET /api/events ──────────────────────────────────────────────────── */

describe('GET /api/events', () => {
  it('returns sectioned payload with hero set to next-soonest upcoming', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);

    (prisma.event.findMany as jest.Mock)
      // first call — upcoming + live. Returned in startTime ASC order
      // (Prisma's orderBy clause), so earliest first.
      .mockResolvedValueOnce([
        fakeEventRow({ slug: 'b', startTime: new Date('2026-06-13T00:00:00Z'), endTime: null }),
        fakeEventRow({ slug: 'a', startTime: new Date('2026-06-20T00:00:00Z'), endTime: null }),
      ])
      // second — past window
      .mockResolvedValueOnce([
        fakeEventRow({
          slug: 'c', startTime: new Date('2026-05-25T00:00:00Z'),
          endTime: new Date('2026-05-25T03:00:00Z'),
        }),
      ]);

    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(res.body.hero?.slug).toBe('b'); // earlier upcoming wins
    expect(res.body.upcoming).toHaveLength(2);
    expect(res.body.recent).toHaveLength(1);
    expect(res.body.past).toHaveLength(0);
    expect(res.body.counts).toEqual({ upcoming: 2, past: 1 });

    jest.useRealTimers();
  });

  it('returns null hero when no upcoming events exist', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);

    (prisma.event.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        fakeEventRow({
          slug: 'c', startTime: new Date('2026-05-25T00:00:00Z'),
          endTime: new Date('2026-05-25T03:00:00Z'),
        }),
      ]);

    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(res.body.hero).toBeNull();
    expect(res.body.upcoming).toHaveLength(0);

    jest.useRealTimers();
  });

  it('classifies state per row via getEventState', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);

    (prisma.event.findMany as jest.Mock)
      .mockResolvedValueOnce([
        // live now — startTime in past, endTime in future
        fakeEventRow({
          slug: 'live-now',
          startTime: new Date('2026-06-12T17:30:00Z'),
          endTime: new Date('2026-06-12T20:00:00Z'),
        }),
        // pure upcoming
        fakeEventRow({
          slug: 'pure-upcoming',
          startTime: new Date('2026-07-01T00:00:00Z'),
          endTime: null,
        }),
      ])
      .mockResolvedValueOnce([]);

    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    const liveRow = res.body.upcoming.find((r: { slug: string }) => r.slug === 'live-now');
    const upcomingRow = res.body.upcoming.find((r: { slug: string }) => r.slug === 'pure-upcoming');
    expect(liveRow.state).toBe('live');
    expect(upcomingRow.state).toBe('upcoming');
    // hero should be the upcoming, not the live one
    expect(res.body.hero.slug).toBe('pure-upcoming');

    jest.useRealTimers();
  });
});

/* ── GET /api/events/:slug ─────────────────────────────────────────────── */

describe('GET /api/events/:slug', () => {
  const baseEvent = fakeEventRow();
  const baseGameRows = [
    {
      announcementType: null,
      game: {
        id: 'g1', igdbId: 100, title: 'Game A',
        coverUrl: 'coverA.jpg', heroImageUrl: 'heroA.jpg',
      },
    },
    {
      announcementType: null,
      game: {
        id: 'g2', igdbId: 200, title: 'Game B',
        coverUrl: null, heroImageUrl: null,
      },
    },
  ];

  it('returns 200 with detail payload + personalisation counts', async () => {
    (prisma.event.findUnique as jest.Mock).mockResolvedValueOnce(baseEvent);
    (prisma.eventGame.findMany as jest.Mock).mockResolvedValueOnce(baseGameRows);
    (prisma.userGame.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'ug1', gameId: 'g1', status: 'Wishlist', wishlistedPlatforms: [] },
      { id: 'ug2', gameId: 'g2', status: 'Backlog', wishlistedPlatforms: [] },
    ]);

    const res = await request(app).get('/api/events/state-of-play-2026-06');
    expect(res.status).toBe(200);
    expect(res.body.event.slug).toBe('state-of-play-2026-06');
    expect(res.body.event.gameCount).toBe(5);
    expect(res.body.event.description).toBe('Sony showcase');
    expect(res.body.games).toHaveLength(2);
    expect(res.body.personalisation).toEqual({
      onWishlistCount: 1, // g1 is Wishlist
      onLibraryCount: 2,  // both have UserGames
    });
  });

  it('returns 404 when slug not in DB AND IGDB lookup also fails', async () => {
    (prisma.event.findUnique as jest.Mock).mockResolvedValue(null);
    (syncSingleEventBySlug as jest.Mock).mockResolvedValue(null);

    const res = await request(app).get('/api/events/nonexistent');
    expect(res.status).toBe(404);
    expect(syncSingleEventBySlug).toHaveBeenCalled();
  });

  it('returns 200 when EV-D16 IGDB fallback resolves a fresh event', async () => {
    // First findUnique → null (cache miss); after sync → returns row.
    (prisma.event.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(baseEvent);
    (syncSingleEventBySlug as jest.Mock).mockResolvedValue('event-id-new');
    (prisma.eventGame.findMany as jest.Mock).mockResolvedValueOnce([]);
    (prisma.userGame.findMany as jest.Mock).mockResolvedValueOnce([]);

    const res = await request(app).get('/api/events/state-of-play-2026-06');
    expect(res.status).toBe(200);
    expect(res.body.event.slug).toBe('state-of-play-2026-06');
    expect(syncSingleEventBySlug).toHaveBeenCalledWith(expect.anything(), 'state-of-play-2026-06');
  });

  it('handles sparse-data events (zero games) without erroring', async () => {
    (prisma.event.findUnique as jest.Mock).mockResolvedValueOnce(
      fakeEventRow({ _count: { games: 0 } }),
    );
    (prisma.eventGame.findMany as jest.Mock).mockResolvedValueOnce([]);
    (prisma.userGame.findMany as jest.Mock).mockResolvedValueOnce([]);

    const res = await request(app).get('/api/events/state-of-play-2026-06');
    expect(res.status).toBe(200);
    expect(res.body.games).toEqual([]);
    expect(res.body.personalisation).toEqual({ onWishlistCount: 0, onLibraryCount: 0 });
  });

  it('counts wishlistedPlatforms (CM12 per-platform) as wishlisted', async () => {
    (prisma.event.findUnique as jest.Mock).mockResolvedValueOnce(baseEvent);
    (prisma.eventGame.findMany as jest.Mock).mockResolvedValueOnce(baseGameRows);
    (prisma.userGame.findMany as jest.Mock).mockResolvedValueOnce([
      // Owned on Backlog but ALSO wishlisted on PS5 → wishlisted per CM12
      { id: 'ug1', gameId: 'g1', status: 'Backlog', wishlistedPlatforms: ['PS5'] },
      { id: 'ug2', gameId: 'g2', status: 'Backlog', wishlistedPlatforms: [] },
    ]);

    const res = await request(app).get('/api/events/state-of-play-2026-06');
    expect(res.body.personalisation.onWishlistCount).toBe(1);
    expect(res.body.personalisation.onLibraryCount).toBe(2);
  });
});

/* ── GET /api/events/:slug/ics ─────────────────────────────────────────── */

describe('GET /api/events/:slug/ics', () => {
  it('returns text/calendar with .ics body when event exists', async () => {
    (prisma.event.findUnique as jest.Mock).mockResolvedValueOnce({
      slug: 'state-of-play-2026-06',
      name: 'State of Play — June 2026',
      description: 'Sony showcase',
      startTime: new Date('2026-06-15T22:00:00Z'),
      endTime: new Date('2026-06-15T23:00:00Z'),
      liveStreamUrl: 'https://www.youtube.com/watch?v=abc',
    });

    const res = await request(app).get('/api/events/state-of-play-2026-06/ics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/calendar');
    expect(res.headers['content-disposition']).toContain('state-of-play-2026-06.ics');
    expect(res.text).toContain('BEGIN:VCALENDAR');
    expect(res.text).toContain('BEGIN:VEVENT');
    // em-dash is not in the RFC 5545 escape set (only \ , ; \n) so it passes through verbatim
    expect(res.text).toContain('SUMMARY:State of Play — June 2026');
    expect(res.text).toContain('DTSTART:20260615T220000Z');
    expect(res.text).toContain('DTEND:20260615T230000Z');
    expect(res.text).toContain('END:VEVENT');
    expect(res.text).toContain('END:VCALENDAR');
  });

  it('returns 404 when event slug does not exist', async () => {
    (prisma.event.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await request(app).get('/api/events/missing/ics');
    expect(res.status).toBe(404);
  });

  it('falls back to 2h end window when endTime is null', async () => {
    (prisma.event.findUnique as jest.Mock).mockResolvedValueOnce({
      slug: 'one-off',
      name: 'One-off announcement',
      description: null,
      startTime: new Date('2026-06-15T22:00:00Z'),
      endTime: null,
      liveStreamUrl: null,
    });

    const res = await request(app).get('/api/events/one-off/ics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('DTSTART:20260615T220000Z');
    // 2h later
    expect(res.text).toContain('DTEND:20260616T000000Z');
  });
});

/* ── POST /api/admin/events/sync ──────────────────────────────────────── */

describe('POST /api/events/:slug/resolve-games', () => {
  it('returns summary on success', async () => {
    (resolveEventGames as jest.Mock).mockResolvedValue({
      eventId: 'event-id-1', linksWritten: 12, gamesUpserted: 5,
    });
    const res = await request(app).post('/api/events/state-of-play-2026-06/resolve-games');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true, eventId: 'event-id-1', linksWritten: 12, gamesUpserted: 5,
    });
    expect(resolveEventGames).toHaveBeenCalledWith(expect.anything(), 'state-of-play-2026-06');
  });

  it('returns 404 when event not found on IGDB', async () => {
    (resolveEventGames as jest.Mock).mockRejectedValue(new Error('Event state-of-play-missing not found on IGDB'));
    const res = await request(app).post('/api/events/state-of-play-missing/resolve-games');
    expect(res.status).toBe(404);
  });

  it('returns 500 with error message on unexpected throw', async () => {
    (resolveEventGames as jest.Mock).mockRejectedValue(new Error('IGDB outage'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).post('/api/events/any/resolve-games');
    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
    spy.mockRestore();
  });
});

describe('POST /api/admin/events/sync', () => {
  it('returns summary on success', async () => {
    (syncAllEvents as jest.Mock).mockResolvedValue({
      scanned: 200, eventsUpserted: 198, gamesUpserted: 47, gameLinksUpserted: 1024,
    });
    const res = await request(app).post('/api/admin/events/sync');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true, scanned: 200, eventsUpserted: 198, gamesUpserted: 47, gameLinksUpserted: 1024,
    });
  });

  it('returns 500 with error message when sync throws', async () => {
    (syncAllEvents as jest.Mock).mockRejectedValue(new Error('IGDB outage'));
    // Silence the console.error from the route handler — expected during this test.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).post('/api/admin/events/sync');
    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toContain('IGDB outage');
    spy.mockRestore();
  });
});
