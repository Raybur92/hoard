import type {
  Feedback,
  FeedbackWithUser,
  UserEvent,
  UserEventWithUser,
  UserGameDetail,
} from '@hoard/types';
import { displayIdentity } from './displayIdentity';
import { normalizeAchievementsByPlatform } from './achievementsShape';

export interface UserGameRow {
  id: string;
  userId: string;
  gameId: string;
  status: string;
  playtimeByPlatform: unknown;
  lastPlayedAt: Date | null;
  notes: string | null;
  rating: number | null;
  // M0: per-platform JSON, replaces the 4 flat achievement columns.
  // Prisma surfaces JSON as `unknown`; the mapper narrows via
  // normalizeAchievementsByPlatform.
  achievementsByPlatform: unknown;
  // F1-PR2 collector-metadata fields per CM2 + CM12. Null on sync-
  // imported rows; populated by manual-add and per-row affordances.
  mediaType: 'DIGITAL' | 'PHYSICAL' | null;
  condition: 'LOOSE' | 'CIB' | 'SEALED' | 'REPLICA' | 'GRADED' | null;
  region: 'NTSC_U' | 'NTSC_J' | 'PAL' | 'OTHER' | null;
  wishlistedPlatforms: string[];
  addedAt: Date;
  updatedAt: Date;
  game: {
    id: string;
    igdbId: number;
    title: string;
    developer: string | null;
    releaseYear: number | null;
    genres: string[];
    themes: string[];
    playerPerspectives: string[];
    coverUrl: string | null;
    heroImageUrl: string | null;
    hltbId: number | null;
    gogAppId: number | null;
    psnNpCommunicationId: string | null;
    hltbData: {
      id: string;
      gameId: string;
      mainStory: number | null;
      mainExtras: number | null;
      completionist: number | null;
      fetchedAt: Date;
    } | null;
  };
}

export function fromPrismaStatus(s: string): UserGameDetail['status'] {
  return (s === 'OnHold' ? 'On Hold' : s) as UserGameDetail['status'];
}

/* ── Feedback (F-series, docs/FEEDBACK_PLAN.md) ── */

export interface FeedbackRow {
  id: string;
  userId: string;
  message: string;
  viewport: string | null;
  ua: string | null;
  read: boolean;
  createdAt: Date;
}

export interface FeedbackRowWithUser extends FeedbackRow {
  user: {
    id: string;
    email: string;
    name: string | null;
    steamId: string | null;
  };
}

export function mapFeedback(f: FeedbackRow): Feedback {
  return {
    id: f.id,
    userId: f.userId,
    message: f.message,
    viewport: f.viewport,
    ua: f.ua,
    read: f.read,
    createdAt: f.createdAt.toISOString(),
  };
}

export function mapFeedbackWithUser(f: FeedbackRowWithUser): FeedbackWithUser {
  return {
    ...mapFeedback(f),
    user: {
      id: f.user.id,
      email: f.user.email,
      name: f.user.name,
      displayIdentity: displayIdentity(f.user),
    },
  };
}

/* ── UserEvent (TL-series, docs/TELEMETRY_PLAN.md) ── */

export interface UserEventRow {
  id: string;
  userId: string;
  event: string;
  // Prisma surfaces JSONB columns as `unknown`-ish JsonValue; we narrow
  // to Record<string, unknown> | null at the mapper boundary so the
  // API-facing type stays clean. Non-object JSON (arrays, primitives)
  // is not produced by our write paths and is treated as null.
  details: unknown;
  createdAt: Date;
}

export interface UserEventRowWithUser extends UserEventRow {
  user: {
    id: string;
    email: string;
    name: string | null;
    steamId: string | null;
  };
}

// Non-object JSON values are normalised to null; all touchpoints MUST
// pass object-shape `details` payloads (or omit the arg entirely — let
// the `details?` default kick in). No JSON.stringify'd strings, no
// explicit null. See TL-D5 in docs/TELEMETRY_PLAN.md. The normalisation
// is a safety net, not a license to drift — a scalar landing in the
// column means a write-site bug.
export function mapUserEvent(e: UserEventRow): UserEvent {
  return {
    id: e.id,
    userId: e.userId,
    event: e.event,
    details:
      e.details && typeof e.details === 'object' && !Array.isArray(e.details)
        ? (e.details as Record<string, unknown>)
        : null,
    createdAt: e.createdAt.toISOString(),
  };
}

export function mapUserEventWithUser(e: UserEventRowWithUser): UserEventWithUser {
  return {
    ...mapUserEvent(e),
    user: {
      id: e.user.id,
      email: e.user.email,
      name: e.user.name,
      displayIdentity: displayIdentity(e.user),
    },
  };
}

export function mapUserGame(ug: UserGameRow): UserGameDetail {
  return {
    id: ug.id,
    userId: ug.userId,
    gameId: ug.gameId,
    game: {
      id: ug.game.id,
      igdbId: ug.game.igdbId,
      title: ug.game.title,
      developer: ug.game.developer,
      releaseYear: ug.game.releaseYear,
      genres: ug.game.genres,
      themes: ug.game.themes,
      playerPerspectives: ug.game.playerPerspectives,
      coverUrl: ug.game.coverUrl,
      heroImageUrl: ug.game.heroImageUrl,
      hltbId: ug.game.hltbId,
      gogAppId: ug.game.gogAppId,
      psnNpCommunicationId: ug.game.psnNpCommunicationId,
    },
    status: fromPrismaStatus(ug.status),
    playtimeByPlatform: ug.playtimeByPlatform as UserGameDetail['playtimeByPlatform'],
    lastPlayedAt: ug.lastPlayedAt?.toISOString() ?? null,
    notes: ug.notes,
    rating: ug.rating,
    achievementsByPlatform: normalizeAchievementsByPlatform(ug.achievementsByPlatform),
    mediaType: ug.mediaType,
    condition: ug.condition,
    region: ug.region,
    wishlistedPlatforms: ug.wishlistedPlatforms,
    addedAt: ug.addedAt.toISOString(),
    updatedAt: ug.updatedAt.toISOString(),
    hltb: ug.game.hltbData
      ? {
          id: ug.game.hltbData.id,
          gameId: ug.game.hltbData.gameId,
          mainStory: ug.game.hltbData.mainStory,
          mainExtras: ug.game.hltbData.mainExtras,
          completionist: ug.game.hltbData.completionist,
          fetchedAt: ug.game.hltbData.fetchedAt.toISOString(),
        }
      : null,
  };
}
