/**
 * GD-PR4b — S4 (Completed) GameDetail mobile surface.
 *
 * Per OQ-GD4-1 default v1: identical relic card to desktop, full-width.
 * Mobile screens are 375-430px; the card's 360px max-width fits with a
 * small inset so the relic doesn't bleed edge-to-edge.
 */

import { useNavigate, useSearchParams } from 'react-router-dom';
import type { GameDetailGameInfo, UserGameDetail } from '@hoard/types';
import { MobileHeader } from '../../layout/MobileHeader';
import { RelicCard } from './RelicCard';
import { useRelicAnimation } from './useRelicAnimation';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';

interface Props {
  game: GameDetailGameInfo;
  userGame: UserGameDetail;
  onMutated: () => void;
}

export function S4Mobile({ game, userGame, onMutated }: Props) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  useDocumentTitle(game.title);
  const animate = useRelicAnimation(userGame.id);
  const focusNotes = params.get('focus') === 'notes';

  return (
    <>
      <MobileHeader title={game.title} onBack={() => navigate(-1)} />
      <div className="app-mobile-content thin-scroll" style={{ padding: '20px 12px 32px' }}>
        <div className={animate ? 'relic-animate' : undefined} data-testid="relic-stage">
          <RelicCard
            game={game}
            userGame={userGame}
            onMutated={onMutated}
            focusNotes={focusNotes}
          />
        </div>
      </div>
    </>
  );
}
