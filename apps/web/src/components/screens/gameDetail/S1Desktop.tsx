/**
 * GD-PR1 — S1 (released, not owned) desktop surface.
 *
 * Per PAGES_PLAN §3.4 visual hierarchy:
 *   cover + meta → `[+ add to library]` (dominant) + `[+ wishlist]` (alt)
 *   → current price offers → screenshots + videos (GD-PR2) → description
 *   → HLTB (deferred to GD-PR2) → lateral nav / events back-links (placeholders).
 *
 * Re-render in place (OQ-GD-6): when the user clicks `[+ add to library]`
 * the AddGameModal opens, save → cache invalidate → SWR refetches the
 * `game:igdb:` key → parent dispatcher detects S3 and renders the legacy
 * GameDetailDesktop. No navigation; URL stays `/game/:igdbId`.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GameDetailGameInfo, UserGameDetail } from '@hoard/types';
import { TopBar } from '../../layout/TopBar';
import { Btn } from '../../primitives/Btn';
import { BackBar } from '../../primitives/BackBar';
import { Chip } from '../../primitives/Chip';
import { Cover } from '../../primitives/Cover';
import { Icon } from '../../primitives/Icon';
import { Marker } from '../../primitives/Marker';
import { AddGameModal } from '../AddGameModal';
import { PriceOffersCard } from './PriceOffersCard';
import { api } from '../../../lib/api';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';

interface Props {
  game: GameDetailGameInfo;
  /**
   * GD-PR1 — when the dispatcher routes a wishlist UserGame to S1
   * (because the legacy S3 doesn't fit "wishlisted but not yet
   * acquired"), we pass the UserGame so the CTAs adapt:
   *   `[+ add to library]` → `[+ acquire]`
   *   `[+ wishlist]`        → `[- remove from wishlist]`
   * Absent → game is truly unowned (S1/S2 per OQ-GD-12).
   */
  wishlistUserGame?: UserGameDetail;
  onMutated: () => void;
}

export function S1Desktop({ game, wishlistUserGame, onMutated }: Props) {
  const navigate = useNavigate();
  useDocumentTitle(game.title);
  const [addOpen, setAddOpen] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [wishlistError, setWishlistError] = useState<string | null>(null);

  const isWishlisted = !!wishlistUserGame;

  async function toggleWishlist() {
    setWishlistBusy(true);
    setWishlistError(null);
    try {
      await api.toggleWishlist(game.igdbId);
      // Cache invalidation in toggleWishlist already covers `game:igdb:`
      // (via invalidateLibrary). The parent dispatcher refetches and
      // re-dispatches by the new state.
      onMutated();
    } catch {
      setWishlistError(
        isWishlisted
          ? `// couldn't remove from wishlist — try again`
          : `// couldn't add to wishlist — try again`,
      );
    } finally {
      setWishlistBusy(false);
    }
  }

  const yearLabel = game.releaseYear ? String(game.releaseYear) : '—';
  const primaryGenre = game.genres[0] ?? '—';
  const description = game.synopsis;
  const allTags = [...game.genres, ...game.themes, ...game.playerPerspectives];

  return (
    <>
      <TopBar crumbs={['hoard', 'browse', game.title.toLowerCase()]} />

      <BackBar />

      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '32px 36px 40px' }}>
        <Marker>
          {isWishlisted ? '// on your wishlist · not yet acquired' : '// not in your hoard yet'}
        </Marker>

        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 32, marginTop: 18, maxWidth: 1100 }}>
          {/* Cover */}
          <Cover
            w={260}
            h={347}
            src={game.coverUrl}
            label={game.title.toUpperCase()}
            dev={game.developer ?? ''}
            year={yearLabel.slice(-2)}
            bright
          />

          {/* Right column — meta + CTAs + description */}
          <div>
            <div className="t-up t-faint" style={{ fontSize: 'var(--text-3xs)' }}>
              {game.developer ?? '—'} · {yearLabel} · {primaryGenre}
            </div>
            <h1 style={{ fontSize: 'var(--text-2xl)', lineHeight: 1, color: 'var(--paper)', marginTop: 8, letterSpacing: '-0.015em', fontFamily: 'var(--mono)', fontWeight: 'normal' }}>
              {game.title}
            </h1>

            {/* IGDB tags row */}
            {allTags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
                {allTags.map((t) => (
                  <Chip key={t}>{t.toLowerCase()}</Chip>
                ))}
              </div>
            )}

            {/* Platforms list */}
            {game.platforms.length > 0 && (
              <div className="t-mono t-faint" style={{ fontSize: 'var(--text-xs)', marginTop: 14 }}>
                {`// platforms · ${game.platforms.join(' · ').toLowerCase()}`}
              </div>
            )}

            {/* CTAs — primary acquisition action stays amber dominant; the
                wishlist toggle adapts label + behaviour based on whether
                the game is already in the user's wishlist. */}
            <div style={{ display: 'flex', gap: 10, marginTop: 22, alignItems: 'center' }}>
              <Btn variant="amber" onClick={() => setAddOpen(true)}>
                {isWishlisted ? '+ acquire' : '+ add to library'}
              </Btn>
              <Btn onClick={() => void toggleWishlist()} disabled={wishlistBusy}>
                {wishlistBusy
                  ? (isWishlisted ? '- removing…' : '+ adding…')
                  : (isWishlisted ? '- remove from wishlist' : '+ wishlist')}
              </Btn>
            </div>
            {wishlistError && (
              <div className="t-mono t-red" role="alert" aria-live="polite" style={{ fontSize: 'var(--text-2xs)', marginTop: 8 }}>
                {wishlistError}
              </div>
            )}

            {/* Description */}
            {description && (
              <div style={{ marginTop: 28 }}>
                <Marker>// about</Marker>
                <p className="t-sans" style={{ marginTop: 10, color: 'var(--paper-dim)', fontSize: 'var(--text-base)', lineHeight: 'var(--lh-relaxed)', maxWidth: 680 }}>
                  {description}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Price offers — full width below the two-column grid */}
        <div style={{ maxWidth: 1100 }}>
          <PriceOffersCard igdbId={game.igdbId} />

          {/* Lateral nav placeholders — filled in by GD-PR5 when reference
              data (developer / publisher / series / collection) ships per
              OQ-GD-8 + OQ-GD-9. Renders empty slots so the architecture
              is in place. */}
          <div style={{ marginTop: 24, opacity: 0.4 }}>
            <Marker>{`// more from this developer · publisher · series · collections — coming soon`}</Marker>
          </div>

          {/* Events back-links placeholder per OQ-GD-7 — filled in when
              the Events workstream lands. */}
          <div style={{ marginTop: 12, opacity: 0.4 }}>
            <Marker>{`// shown at events — coming soon`}</Marker>
          </div>
        </div>
      </div>

      {addOpen && (
        <AddGameModal
          intent="own"
          prefilledQuery={game.title}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setAddOpen(false);
            onMutated();
          }}
        />
      )}
    </>
  );
}
