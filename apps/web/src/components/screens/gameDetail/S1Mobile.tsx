/**
 * GD-PR1 — S1 (released, not owned) mobile surface.
 *
 * Mobile compresses the desktop two-column hero into a single column:
 *   cover (centered, smaller) → meta → title → tags strip → CTAs →
 *   description → price offers list → lateral nav placeholders.
 *
 * The CTAs flip order vs desktop — primary `[+ add to library]` stays
 * dominant but lands directly above the description (rather than to the
 * right of the cover), which scans cleanly on a narrow viewport.
 */

import { useState } from 'react';
import type { GameDetailGameInfo, UserGameDetail } from '@hoard/types';
import { MobileHeader } from '../../layout/MobileHeader';
import { Btn } from '../../primitives/Btn';
import { Chip } from '../../primitives/Chip';
import { Cover } from '../../primitives/Cover';
import { Marker } from '../../primitives/Marker';
import { AddGameModal } from '../AddGameModal';
import { PriceOffersCard } from './PriceOffersCard';
import { api } from '../../../lib/api';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';

interface Props {
  game: GameDetailGameInfo;
  wishlistUserGame?: UserGameDetail;
  onMutated: () => void;
}

export function S1Mobile({ game, wishlistUserGame, onMutated }: Props) {
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
      <MobileHeader title={game.title} back />

      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '16px 16px 32px' }}>
        <Marker>
          {isWishlisted ? '// on your wishlist · not yet acquired' : '// not in your hoard yet'}
        </Marker>

        {/* Cover centered */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <Cover
            w={180}
            h={240}
            src={game.coverUrl}
            label={game.title.toUpperCase()}
            dev={game.developer ?? ''}
            year={yearLabel.slice(-2)}
            bright
          />
        </div>

        {/* Meta line */}
        <div className="t-up t-faint" style={{ fontSize: 'var(--text-3xs)', marginTop: 18, textAlign: 'center' }}>
          {game.developer ?? '—'} · {yearLabel} · {primaryGenre}
        </div>

        {/* Title */}
        <h1 style={{ fontSize: 'var(--text-xl)', lineHeight: 1.1, color: 'var(--paper)', marginTop: 6, textAlign: 'center', letterSpacing: '-0.015em', fontFamily: 'var(--mono)', fontWeight: 'normal' }}>
          {game.title}
        </h1>

        {/* Tags strip */}
        {allTags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14, justifyContent: 'center' }}>
            {allTags.slice(0, 6).map((t) => (
              <Chip key={t}>{t.toLowerCase()}</Chip>
            ))}
          </div>
        )}

        {/* CTAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
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

        {/* Platforms */}
        {game.platforms.length > 0 && (
          <div className="t-mono t-faint" style={{ fontSize: 'var(--text-2xs)', marginTop: 18 }}>
            {`// platforms · ${game.platforms.join(' · ').toLowerCase()}`}
          </div>
        )}

        {/* Description */}
        {description && (
          <div style={{ marginTop: 24 }}>
            <Marker>// about</Marker>
            <p className="t-sans" style={{ marginTop: 8, color: 'var(--paper-dim)', fontSize: 'var(--text-sm)', lineHeight: 'var(--lh-relaxed)' }}>
              {description}
            </p>
          </div>
        )}

        <PriceOffersCard igdbId={game.igdbId} />

        <div style={{ marginTop: 20, opacity: 0.4 }}>
          <Marker>{`// more from developer · publisher · series — coming soon`}</Marker>
        </div>
        <div style={{ marginTop: 8, opacity: 0.4 }}>
          <Marker>{`// shown at events — coming soon`}</Marker>
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
