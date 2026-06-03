/**
 * GD-PR4b — S4 (Completed) GameDetail desktop surface.
 *
 * Renders the OQ-GD-13 archivist relic card as the centerpiece, with
 * the GameDetail page chrome (TopBar + back) above it. The 5-stage
 * consecration animation fires on first-visit (per `useRelicAnimation`).
 *
 * Other GameDetail chrome — lateral-nav / Collections placeholder /
 * events strip — deferred to GD-PR4c per the plan's OQ-GD4-4 default.
 */

import { useNavigate, useSearchParams } from 'react-router-dom';
import type { GameDetailGameInfo, UserGameDetail } from '@hoard/types';
import { TopBar } from '../../layout/TopBar';
import { Btn } from '../../primitives/Btn';
import { BackBar } from '../../primitives/BackBar';
import { Icon } from '../../primitives/Icon';
import { RelicCard } from './RelicCard';
import { useRelicAnimation } from './useRelicAnimation';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';

interface Props {
  game: GameDetailGameInfo;
  userGame: UserGameDetail;
  onMutated: () => void;
}

export function S4Desktop({ game, userGame, onMutated }: Props) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  useDocumentTitle(game.title);
  const animate = useRelicAnimation(userGame.id);
  const focusNotes = params.get('focus') === 'notes';

  return (
    <>
      <TopBar crumbs={['hoard', 'archive', game.title.toLowerCase()]} />

      <BackBar />

      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '40px 36px 60px' }}>
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
