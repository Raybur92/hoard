/**
 * EV-PR1 — `/api/events` routes (docs/EVENTS_PLAN.md §6).
 *
 * Three user-facing endpoints:
 *   - GET  /api/events             — list view payload (sectioned by state)
 *   - GET  /api/events/:slug       — detail view payload
 *   - GET  /api/events/:slug/ics   — calendar export (`.ics`)
 *
 * Admin sync trigger lives in `routes/admin.ts` to match the
 * `/admin/deals/refresh` precedent.
 *
 * NOT to be confused with `/api/admin/events` (telemetry feed for UserEvent).
 * The path namespaces don't collide — telemetry is admin-scoped; these are
 * the public-to-active-users showcase events.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '@hoard/db';
import { requireUser } from '../middleware/user';
import { requireActive } from '../middleware/active';
import { getEventState, syncSingleEventBySlug, resolveEventGames } from '../services/events';
import type {
  EventListRow,
  EventDetailResponse,
  EventsListResponse,
  EventGameRow,
} from '@hoard/types';
import type { GameStatus } from '@hoard/types';

const router = Router();

/* ── Helpers ──────────────────────────────────────────────────────────── */

interface EventRow {
  slug: string;
  name: string;
  startTime: Date;
  endTime: Date | null;
  liveStreamUrl: string | null;
  logoUrl: string | null;
  networks: unknown;
  description: string | null;
  timeZone: string | null;
  videos: unknown;
  gamesResolvedAt: Date | null;
}

interface EventRowWithCount extends EventRow {
  _count: { games: number };
}

function isNetworkArray(v: unknown): v is Array<{ name: string; type: string; url: string | null }> {
  return Array.isArray(v);
}
function isVideoArray(v: unknown): v is Array<{ youtubeId: string; name: string | null }> {
  return Array.isArray(v);
}

function toListRow(row: EventRowWithCount): EventListRow {
  return {
    slug: row.slug,
    name: row.name,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime?.toISOString() ?? null,
    liveStreamUrl: row.liveStreamUrl,
    logoUrl: row.logoUrl,
    networks: isNetworkArray(row.networks) ? row.networks : [],
    gameCount: row._count.games,
    gamesResolvedAt: row.gamesResolvedAt?.toISOString() ?? null,
    state: getEventState({
      startTime: row.startTime.toISOString(),
      endTime: row.endTime?.toISOString() ?? null,
    }),
  };
}

/* ── GET /api/events ──────────────────────────────────────────────────── */

/**
 * List view payload. Sections by state:
 *   - hero: next-soonest upcoming event globally (EV-D13)
 *   - upcoming: all upcoming events (state='upcoming' OR 'live')
 *   - recent: past events within last 30 days
 *   - past: past events older than 30 days, within 24-month depth (EV-D6)
 */
router.get('/events', requireUser, requireActive, async (_req: Request, res: Response): Promise<void> => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const twentyFourMonthsAgo = new Date(now);
  twentyFourMonthsAgo.setMonth(twentyFourMonthsAgo.getMonth() - 24);

  // Two queries — upcoming (start in future) + past+live within window.
  // The state classification runs in JS on the result, so a `live` event
  // with start_time in the past still surfaces in the upcoming section.
  const [upcomingAndLiveRows, pastRows] = await Promise.all([
    prisma.event.findMany({
      where: {
        OR: [
          { startTime: { gte: now } },
          // Live candidates — past start, future or null end. The 4h
          // window for null-end-time live events is enforced client-side
          // by getEventState; here we just over-include and filter.
          {
            startTime: { lt: now },
            OR: [
              { endTime: null },
              { endTime: { gte: now } },
            ],
          },
        ],
      },
      orderBy: { startTime: 'asc' },
      select: {
        slug: true, name: true, startTime: true, endTime: true,
        liveStreamUrl: true, logoUrl: true, networks: true,
        description: true, timeZone: true, videos: true,
        gamesResolvedAt: true,
        _count: { select: { games: true } },
      },
    }),
    prisma.event.findMany({
      where: {
        startTime: { gte: twentyFourMonthsAgo, lt: now },
        OR: [
          { endTime: { lt: now } },
          // Null-endTime past events — startTime + 4h is in the past.
          // Approximate at query time as "startTime > 4h before now" so
          // we don't miss any; getEventState filters precisely.
          { endTime: null },
        ],
      },
      orderBy: { startTime: 'desc' },
      select: {
        slug: true, name: true, startTime: true, endTime: true,
        liveStreamUrl: true, logoUrl: true, networks: true,
        description: true, timeZone: true, videos: true,
        gamesResolvedAt: true,
        _count: { select: { games: true } },
      },
    }),
  ]);

  // Map + classify. The first list may contain some genuinely-past rows
  // (live cutoff edge case) — re-classify with getEventState.
  const upcomingClassified: EventListRow[] = upcomingAndLiveRows
    .map((r): EventListRow => toListRow(r as EventRowWithCount))
    .filter((r: EventListRow) => r.state !== 'past');

  const pastClassified: EventListRow[] = pastRows
    .map((r): EventListRow => toListRow(r as EventRowWithCount))
    .filter((r: EventListRow) => r.state === 'past');

  // Sort upcoming + live ascending by startTime (already from DB).
  // Section recent (≤30d ago) vs older.
  const recent = pastClassified.filter((r: EventListRow) => new Date(r.startTime) >= thirtyDaysAgo);
  const past = pastClassified.filter((r: EventListRow) => new Date(r.startTime) < thirtyDaysAgo);

  const hero = upcomingClassified.find((r: EventListRow) => r.state === 'upcoming') ?? null;

  const payload: EventsListResponse = {
    hero,
    upcoming: upcomingClassified,
    recent,
    past,
    counts: {
      upcoming: upcomingClassified.length,
      past: recent.length + past.length,
    },
  };
  res.json(payload);
});

/* ── GET /api/events/:slug ─────────────────────────────────────────────── */

interface EventGameJoinedRow {
  game: {
    id: string;
    igdbId: number;
    title: string;
    coverUrl: string | null;
    heroImageUrl: string | null;
  };
  announcementType: string | null;
}

router.get('/events/:slug', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
  const { slug } = req.params as { slug: string };
  if (!slug) {
    res.status(400).json({ error: 'Slug required' });
    return;
  }
  const userId = req.userId;

  let row = await prisma.event.findUnique({
    where: { slug },
    select: {
      slug: true, name: true, startTime: true, endTime: true,
      liveStreamUrl: true, logoUrl: true, networks: true,
      description: true, timeZone: true, videos: true,
      gamesResolvedAt: true,
      _count: { select: { games: true } },
    },
  });

  // EV-D16 — on miss, attempt one IGDB lookup-by-slug before responding 404.
  // Catches the case where a brand-new event link is shared between IGDB
  // posting + the next nightly sync.
  if (!row) {
    try {
      const upsertedId = await syncSingleEventBySlug(prisma, slug);
      if (upsertedId) {
        row = await prisma.event.findUnique({
          where: { slug },
          select: {
            slug: true, name: true, startTime: true, endTime: true,
            liveStreamUrl: true, logoUrl: true, networks: true,
            description: true, timeZone: true, videos: true,
            gamesResolvedAt: true,
            _count: { select: { games: true } },
          },
        });
      }
    } catch {
      // Network / IGDB error — fall through to 404. The user retries later;
      // nightly cron picks it up.
    }
  }

  if (!row) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }

  // Game grid — joined to the user's UserGame so the card chips can render
  // `on your wishlist` / `in your library` per-row.
  const gameRows: EventGameJoinedRow[] = await prisma.eventGame.findMany({
    where: { event: { slug } },
    select: {
      announcementType: true,
      game: {
        select: { id: true, igdbId: true, title: true, coverUrl: true, heroImageUrl: true },
      },
    },
  });

  const gameIds = gameRows.map((g) => g.game.id);
  const userGames = await prisma.userGame.findMany({
    where: { userId, gameId: { in: gameIds } },
    select: { id: true, gameId: true, status: true, wishlistedPlatforms: true },
  });
  const userGameByGameId = new Map<string, { id: string; status: GameStatus; wishlisted: boolean }>();
  for (const ug of userGames) {
    const wishlisted = ug.status === 'Wishlist' || (ug.wishlistedPlatforms?.length ?? 0) > 0;
    userGameByGameId.set(ug.gameId, { id: ug.id, status: ug.status as GameStatus, wishlisted });
  }

  let onWishlistCount = 0;
  let onLibraryCount = 0;
  const games: EventGameRow[] = gameRows.map((g): EventGameRow => {
    const ug = userGameByGameId.get(g.game.id);
    if (ug) {
      onLibraryCount += 1;
      if (ug.wishlisted) onWishlistCount += 1;
    }
    return {
      igdbId: g.game.igdbId,
      name: g.game.title,
      coverUrl: g.game.coverUrl,
      heroImageUrl: g.game.heroImageUrl,
      announcementType: g.announcementType,
      userGame: ug ? { id: ug.id, status: ug.status } : null,
    };
  });

  const listRow = toListRow(row);
  const payload: EventDetailResponse = {
    event: {
      ...listRow,
      description: row.description,
      timeZone: row.timeZone,
      videos: isVideoArray(row.videos) ? row.videos : [],
    },
    games,
    personalisation: { onWishlistCount, onLibraryCount },
  };
  res.json(payload);
});

/* ── POST /api/events/:slug/resolve-games ──────────────────────────────── */

/**
 * Lazy per-event game resolution (Andrea 2026-06-02). Triggered by the
 * detail view's `[load games]` button. Fetches the event from IGDB to get
 * its current `games[]`, batches the IGDB lookups for any games not yet
 * in Hoard's catalogue, writes the EventGame join rows, stamps
 * `gamesResolvedAt = NOW()`.
 *
 * Idempotent: re-clicking the button after resolution refreshes the
 * resolution (useful when IGDB community-curates new games into an event).
 *
 * Returns the summary counters; the client re-fetches GET /api/events/:slug
 * to pick up the populated game grid.
 */
router.post('/events/:slug/resolve-games', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
  const { slug } = req.params as { slug: string };
  if (!slug) {
    res.status(400).json({ error: 'Slug required' });
    return;
  }
  try {
    const result = await resolveEventGames(prisma, slug);
    res.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/not found/i.test(message)) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    console.error('[events/resolve-games] failed:', err);
    res.status(500).json({ ok: false, error: message });
  }
});

/* ── GET /api/events/:slug/ics ─────────────────────────────────────────── */

/** ICS line-fold per RFC 5545 §3.1: lines > 75 octets are folded with
 *  CRLF + space continuation. Most fields stay under, but description +
 *  long names can overflow. */
function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let i = 0;
  while (i < line.length) {
    chunks.push(line.slice(i, i + (i === 0 ? 75 : 74)));
    i += i === 0 ? 75 : 74;
  }
  return chunks.join('\r\n ');
}

/** ICS-safe escape per RFC 5545 §3.3.11. Newlines → \\n; \\ , ; → escaped. */
function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function toIcsDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

router.get('/events/:slug/ics', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
  const { slug } = req.params as { slug: string };
  if (!slug) {
    res.status(400).json({ error: 'Slug required' });
    return;
  }
  const event = await prisma.event.findUnique({
    where: { slug },
    select: {
      slug: true, name: true, description: true,
      startTime: true, endTime: true, liveStreamUrl: true,
    },
  });
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }

  // Per EV-D15: UTC encoding for EV-PR1. TZID-aware encoding in EV-PR4.
  // Default 2h end when endTime is null — keeps calendar apps from
  // rendering a 0-min event sliver.
  const dtStart = toIcsDate(event.startTime);
  const dtEnd = toIcsDate(
    event.endTime ?? new Date(event.startTime.getTime() + 2 * 60 * 60 * 1000),
  );
  const dtStamp = toIcsDate(new Date());

  const summary = `SUMMARY:${escapeIcsText(event.name)}`;
  const descriptionParts: string[] = [];
  if (event.description) descriptionParts.push(event.description);
  if (event.liveStreamUrl) descriptionParts.push(`Stream: ${event.liveStreamUrl}`);
  const description = descriptionParts.length > 0
    ? `DESCRIPTION:${escapeIcsText(descriptionParts.join('\n\n'))}`
    : null;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hoard//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:hoard-event-${event.slug}@gamehoardr.com`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    foldIcsLine(summary),
    ...(description ? [foldIcsLine(description)] : []),
    ...(event.liveStreamUrl ? [foldIcsLine(`URL:${event.liveStreamUrl}`)] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const body = lines.join('\r\n') + '\r\n';
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${event.slug}.ics"`);
  res.status(200).send(body);
});

export default router;
