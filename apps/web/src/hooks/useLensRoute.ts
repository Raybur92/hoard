import { useLocation, useParams } from 'react-router-dom';
import type { GameStatus } from '@hoard/types';

/**
 * B-IGDB-3b2 — derives the active primary lens from the current URL.
 *
 *   /library                           → { type: null, slug: null }
 *   /library/Playing                   → { type: 'status', slug: 'Playing' }
 *   /library/by-genre/role-playing-rpg → { type: 'genre',  slug: 'role-playing-rpg' }
 *   /library/by-theme/horror           → { type: 'theme',  slug: 'horror' }
 *   /library/by-perspective/first-pers → { type: 'perspective', slug: 'first-pers' }
 *
 * Returns the SLUG, not the canonical tag name. Callers that need the
 * canonical name resolve it via `useLensIndex()` + `findTagBySlug()`. The
 * separation lets the slug→name lookup happen once at the data layer
 * (lens-index fetch) rather than re-running for every render.
 *
 * `status` is special because the route shape is `/library/:status` —
 * the slug there IS the canonical value (e.g. "Playing", "OnHold");
 * no lens-index lookup needed.
 */
export type LensType = 'status' | 'genre' | 'theme' | 'perspective';

export interface LensRoute {
  /** null = overview (no lens active). */
  type: LensType | null;
  /** URL slug — status value for `status`, kebab-slug for tag lenses. null on overview. */
  slug: string | null;
}

export function useLensRoute(): LensRoute {
  const params = useParams<{ status?: string; slug?: string }>();
  const { pathname } = useLocation();

  // Tag lenses match `/library/by-{dim}/:slug` — params.slug is set on
  // these routes, params.status is not. Disambiguate via pathname.
  if (params.slug) {
    if (pathname.startsWith('/library/by-genre/'))       return { type: 'genre',       slug: params.slug };
    if (pathname.startsWith('/library/by-theme/'))       return { type: 'theme',       slug: params.slug };
    if (pathname.startsWith('/library/by-perspective/')) return { type: 'perspective', slug: params.slug };
  }
  if (params.status) {
    return { type: 'status', slug: params.status };
  }
  return { type: null, slug: null };
}

/** Status enum guard — used when consuming the `status` lens value. */
export function asStatus(slug: string | null): GameStatus | null {
  const valid: GameStatus[] = ['Playing', 'On Hold', 'Completed', 'Backlog', 'Dropped', 'Wishlist'];
  return slug && (valid as string[]).includes(slug) ? (slug as GameStatus) : null;
}
