/**
 * GD-PR2 — S2 (upcoming, not owned) mobile surface.
 *
 * Compresses the desktop hero (cover-left + giant T-N) into a single
 * column: cover centered → giant T-N + title → live d/h/m/s tick row
 * → CTAs stacked → tags → release dates panel → preorder links →
 * screenshots → videos → price offers → news placeholder → description
 * → lateral nav placeholders.
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
import { ReleaseDatesPanel } from './ReleaseDatesPanel';
import { PreorderLinks } from './PreorderLinks';
import { ScreenshotsRail } from './ScreenshotsRail';
import { VideosRail } from './VideosRail';
import { api } from '../../../lib/api';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import { useNow } from '../../../hooks/useNow';
import { countdownParts, daysUntil, upcomingDateParts } from '../../../lib/utils';

interface Props {
  game: GameDetailGameInfo;
  wishlistUserGame?: UserGameDetail;
  onMutated: () => void;
}

export function S2Mobile({ game, wishlistUserGame, onMutated }: Props) {
  useDocumentTitle(game.title);
  const now = useNow(1000);
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

  const cd = countdownParts(game.releaseDate, now);
  const away = daysUntil(game.releaseDate, now);
  const dateParts = upcomingDateParts(game.releaseDate);
  const primaryGenre = game.genres[0] ?? '—';
  const allTags = [...game.genres, ...game.themes, ...game.playerPerspectives];

  return (
    <>
      <MobileHeader title={game.title} back />

      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '16px 16px 32px' }}>
        <Marker style={{ color: 'var(--amber)' }}>
          {isWishlisted ? '// on your wishlist · upcoming' : '// upcoming release'}
        </Marker>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
          <Cover
            w={180}
            h={240}
            src={game.coverUrl}
            label={(game.title.split(' ')[0] ?? game.title).toUpperCase()}
            dev={game.developer ?? '—'}
            year={dateParts.full.split(',')[1]?.trim() ?? null}
            bright
          />
        </div>

        {/* Giant T-N + title */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <span className="t-display" style={{ fontSize: 60, lineHeight: 0.85, color: 'var(--amber)' }}>
            T-{away}
          </span>
        </div>
        <h1 style={{ fontSize: 'var(--text-xl)', lineHeight: 1.1, color: 'var(--paper)', marginTop: 8, textAlign: 'center', letterSpacing: '-0.015em', fontFamily: 'var(--mono)', fontWeight: 'normal' }}>
          {game.title}
        </h1>
        <div className="t-mono t-dim" style={{ fontSize: 'var(--text-xs)', marginTop: 4, textAlign: 'center' }}>
          {game.developer ?? '—'} · {primaryGenre}
        </div>
        <div className="t-mono t-faint" style={{ fontSize: 'var(--text-2xs)', marginTop: 4, textAlign: 'center' }}>
          releases {dateParts.full}
        </div>

        {/* Live d/h/m/s tick */}
        {cd && (
          <div style={{ display: 'flex', gap: 6, marginTop: 14, justifyContent: 'center' }}>
            {([['d', cd.d], ['h', cd.h], ['m', cd.m], ['s', cd.s]] as [string, string][]).map(([k, v]) => (
              <div key={k} style={{
                minWidth: 50, padding: '6px 8px',
                background: 'var(--ink-2)', border: '1px solid var(--rule)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
              }}>
                <span className="t-display" style={{ fontSize: 'var(--text-lg)', lineHeight: 1, color: 'var(--paper)' }}>{v}</span>
                <span className="t-faint t-up" style={{ fontSize: 'var(--text-3xs)', marginTop: 2 }}>{k}</span>
              </div>
            ))}
          </div>
        )}

        {/* CTAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
          <Btn variant="amber" onClick={() => void toggleWishlist()} disabled={wishlistBusy}>
            {wishlistBusy
              ? (isWishlisted ? '- removing…' : '+ adding…')
              : (isWishlisted ? '- remove from wishlist' : '+ wishlist')}
          </Btn>
          <Btn onClick={() => setAddOpen(true)}>
            + add to library (preorder)
          </Btn>
        </div>
        {wishlistError && (
          <div className="t-mono t-red" role="alert" aria-live="polite" style={{ fontSize: 'var(--text-2xs)', marginTop: 8 }}>
            {wishlistError}
          </div>
        )}

        {/* Tags */}
        {allTags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 18, justifyContent: 'center' }}>
            {allTags.slice(0, 6).map((t) => <Chip key={t}>{t.toLowerCase()}</Chip>)}
          </div>
        )}

        <ReleaseDatesPanel entries={game.releaseDates ?? []} />
        <PreorderLinks game={game} />
        <ScreenshotsRail screenshotIds={game.screenshotIds ?? []} title={game.title} />
        <VideosRail videoIds={game.videoIds ?? []} title={game.title} />
        <PriceOffersCard igdbId={game.igdbId} />

        <div style={{ marginTop: 20, opacity: 0.5 }}>
          <Marker>{`// latest news — coming soon`}</Marker>
        </div>

        {game.synopsis && (
          <div style={{ marginTop: 24 }}>
            <Marker>// about</Marker>
            <p className="t-sans" style={{ marginTop: 8, color: 'var(--paper-dim)', fontSize: 'var(--text-sm)', lineHeight: 'var(--lh-relaxed)' }}>
              {game.synopsis}
            </p>
          </div>
        )}

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
