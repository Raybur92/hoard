/**
 * GD-PR2 — S2 (upcoming, not owned) desktop surface (PAGES_PLAN §3.4).
 *
 * Visual hierarchy per spec:
 *   cover + meta → giant countdown + `[+ wishlist]` (dominant) →
 *   release-dates-per-region-platform expandable → preorder deep-links →
 *   screenshots + videos → latest news (placeholder) → description →
 *   lateral nav / events back-links (placeholders).
 *
 * HLTB intentionally absent — nobody has played the game yet (community
 * times don't exist or are bogus). Spec line in §3.3.
 *
 * Video/screenshot strategy for GD-PR2:
 *   - Videos: thumbnail link out to YouTube in a new tab. Embed iframe
 *     deferred to a polish PR (CSP carve-out required).
 *   - Screenshots: thumbnail row, click opens IGDB full-res in new tab.
 *     Lightbox modal deferred to polish.
 *
 * Re-render in place: when the user `[+ wishlist]`s or `[+ acquire]`s,
 * cache.invalidate fires + the parent dispatcher refetches; state may
 * transition (e.g. S2 → S3 if the user picks Backlog + the game has been
 * released after all, or stays S2 if it's still upcoming). URL unchanged.
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

export function S2Desktop({ game, wishlistUserGame, onMutated }: Props) {
  const navigate = useNavigate();
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
      <TopBar crumbs={['hoard', 'releases', game.title.toLowerCase()]} />

      <BackBar />

      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '32px 36px 40px' }}>
        {/* Hero — cover + giant countdown + CTAs */}
        <section
          className="panel"
          style={{
            padding: 28,
            display: 'grid',
            gridTemplateColumns: '240px 1fr',
            gap: 32,
            alignItems: 'start',
            borderColor: 'var(--amber-dim)',
            maxWidth: 1100,
          }}
        >
          <Cover
            w={240}
            h={320}
            src={game.coverUrl}
            label={(game.title.split(' ')[0] ?? game.title).toUpperCase()}
            dev={game.developer ?? '—'}
            year={dateParts.full.split(',')[1]?.trim() ?? null}
            bright
          />

          <div style={{ minWidth: 0 }}>
            <Marker style={{ color: 'var(--amber)' }}>
              {isWishlisted ? '// on your wishlist · upcoming' : '// upcoming release · not in your hoard yet'}
            </Marker>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, marginTop: 14, flexWrap: 'wrap' }}>
              <span className="t-display" style={{ fontSize: 84, lineHeight: 0.85, color: 'var(--amber)' }}>
                T-{away}
              </span>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ fontSize: 'var(--text-2xl)', lineHeight: 1.05, color: 'var(--paper)', letterSpacing: '-0.015em', fontFamily: 'var(--mono)', fontWeight: 'normal', margin: 0 }}>
                  {game.title}
                </h1>
                <div className="t-mono t-dim" style={{ fontSize: 'var(--text-xs)', marginTop: 6 }}>
                  {game.developer ?? '—'} · {primaryGenre} · releases {dateParts.full}
                </div>
              </div>
            </div>

            {/* Live d/h/m/s tick */}
            {cd && (
              <div style={{ display: 'flex', gap: 6, marginTop: 18 }}>
                {([['d', cd.d], ['h', cd.h], ['m', cd.m], ['s', cd.s]] as [string, string][]).map(([k, v]) => (
                  <div key={k} style={{
                    minWidth: 56, padding: '8px 10px',
                    background: 'var(--ink-2)', border: '1px solid var(--rule)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                  }}>
                    <span className="t-display" style={{ fontSize: 'var(--text-xl)', lineHeight: 1, color: 'var(--paper)' }}>{v}</span>
                    <span className="t-faint t-up" style={{ fontSize: 'var(--text-3xs)', marginTop: 2 }}>{k}</span>
                  </div>
                ))}
              </div>
            )}

            {/* CTAs — wishlist dominant (S2 framing); acquire is the alt */}
            <div style={{ display: 'flex', gap: 10, marginTop: 22, alignItems: 'center' }}>
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 18 }}>
                {allTags.slice(0, 8).map((t) => <Chip key={t}>{t.toLowerCase()}</Chip>)}
              </div>
            )}
          </div>
        </section>

        {/* Release dates per region × platform */}
        <ReleaseDatesPanel entries={game.releaseDates ?? []} />

        {/* Preorder deep-links */}
        <PreorderLinks game={game} />

        {/* Screenshots + videos */}
        <ScreenshotsRail screenshotIds={game.screenshotIds ?? []} title={game.title} />
        <VideosRail videoIds={game.videoIds ?? []} title={game.title} />

        {/* Price offers — MSRP for upcoming games typically; render empty
            gracefully if ITAD has nothing yet. */}
        <div style={{ maxWidth: 1100 }}>
          <PriceOffersCard igdbId={game.igdbId} />
        </div>

        {/* Latest news placeholder per OQ-GD-15 #3 */}
        <div style={{ marginTop: 24, maxWidth: 1100, opacity: 0.5 }}>
          <Marker>{`// latest news — coming soon`}</Marker>
        </div>

        {/* Description */}
        {game.synopsis && (
          <div style={{ marginTop: 24, maxWidth: 1100 }}>
            <Marker>// about</Marker>
            <p className="t-sans" style={{ marginTop: 10, color: 'var(--paper-dim)', fontSize: 'var(--text-base)', lineHeight: 'var(--lh-relaxed)' }}>
              {game.synopsis}
            </p>
          </div>
        )}

        {/* Lateral nav + events placeholders */}
        <div style={{ marginTop: 24, maxWidth: 1100, opacity: 0.4 }}>
          <Marker>{`// more from developer · publisher · series — coming soon`}</Marker>
        </div>
        <div style={{ marginTop: 12, maxWidth: 1100, opacity: 0.4 }}>
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
