/**
 * GD-PR4b polish (2026-06-01) — full-screen relic overlay.
 *
 * Opens via the `[see relic]` button on the legacy GameDetail surface,
 * OR auto-opens once when the user flips a game's status to Completed
 * (consecration moment). Renders the relic in READ-ONLY mode — no
 * inline editors, all values printed as inscribed text. Editing happens
 * on the underlying legacy GameDetail.
 *
 * Animation: 5-stage consecration choreography fires on the FIRST open
 * per (user, game), gated by `useRelicAnimation`'s localStorage key.
 * Subsequent opens render in final state instantly.
 *
 * Accessibility: `role="dialog"`, `aria-modal`, focus trap, Escape to
 * close, click outside the relic card to close.
 */

import { useEffect, useCallback } from 'react';
import type { UserGameDetail } from '@hoard/types';
import { Icon } from '../../primitives/Icon';
import { RelicCard } from './RelicCard';
import { useRelicAnimation } from './useRelicAnimation';
import { useFocusTrap } from '../../../hooks/useFocusTrap';
import { useGameByIgdb } from '../../../hooks/useGameByIgdb';

interface Props {
  igdbId: number;
  userGame: UserGameDetail;
  onClose: () => void;
}

/**
 * Fetches the full GameDetailGameInfo (carries relicDitherSvg + sigils
 * that the legacy /api/games/:userGameId endpoint doesn't return) via
 * useGameByIgdb. When the dispatcher's already loaded the page — the
 * common case since the overlay opens from inside it — the v2 cache
 * entry resolves the hook synchronously with no network round-trip.
 */
export function RelicOverlay({ igdbId, userGame, onClose }: Props) {
  const animate = useRelicAnimation(userGame.id);
  const overlayRef = useFocusTrap<HTMLDivElement>(true);
  const { data: gameDetail } = useGameByIgdb(igdbId);
  const game = gameDetail?.game ?? null;

  // Esc closes; click outside the relic card closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleScrimClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Only close when the click landed on the scrim itself, not the card.
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  // Lock the body scroll while the overlay is open so the relic stays
  // the focus of the page.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      ref={overlayRef}
      className="relic-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Archivist relic${game ? ` for ${game.title}` : ''}`}
      onClick={handleScrimClick}
      data-testid="relic-overlay"
    >
      <button
        type="button"
        className="relic-overlay-close"
        aria-label="Close relic"
        onClick={onClose}
      >
        <Icon name="x" size={14} />
      </button>
      <div className={animate ? 'relic-animate relic-overlay-inner' : 'relic-overlay-inner'}>
        {game ? (
          <RelicCard game={game} userGame={userGame} readonly />
        ) : (
          <div className="relic-overlay-loading">// loading relic…</div>
        )}
      </div>
    </div>
  );
}
