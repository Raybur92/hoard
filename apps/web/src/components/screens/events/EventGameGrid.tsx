import { Link } from 'react-router-dom';
import type { EventGameRow } from '@hoard/types';
import { Cover } from '../../primitives/Cover';
import { Marker } from '../../primitives/Marker';

export interface EventGameGridProps {
  games: EventGameRow[];
  /** EV-D5 — when the list is sparse for a non-upcoming event, render the
   *  community-curated disclaimer above the grid. */
  showSparseDisclaimer?: boolean;
  /** Mobile shifts to 2-col grid per OQ-EV-9 (deferred for full mobile pass
   *  in EV-PR4 but applied here so the chrome is sized right today). */
  mobile?: boolean;
}

const SPARSE_THRESHOLD = 5;

export function EventGameGrid({ games, showSparseDisclaimer, mobile }: EventGameGridProps) {
  if (games.length === 0) {
    return (
      <div className="panel" style={{ padding: 24, textAlign: 'center' }}>
        <Marker>// no games linked to this event yet</Marker>
        <div className="t-sans t-dim" style={{ fontSize: 'var(--text-sm)', marginTop: 8 }}>
          IGDB's game list for this event is community-curated. Check back later.
        </div>
      </div>
    );
  }

  const cols = mobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(140px, 1fr))';
  const renderSparse = showSparseDisclaimer && games.length < SPARSE_THRESHOLD;

  return (
    <>
      {renderSparse && (
        <Marker style={{ marginBottom: 12, color: 'var(--paper-faint)' }}>
          // game list is community-curated · {games.length} {games.length === 1 ? 'game' : 'games'} linked so far
        </Marker>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 16 }}>
        {games.map((g) => (
          <EventGameCard key={g.igdbId} game={g} />
        ))}
      </div>
    </>
  );
}

function EventGameCard({ game }: { game: EventGameRow }) {
  const isWishlist = game.userGame?.status === 'Wishlist';
  const isOwned = game.userGame && !isWishlist;

  return (
    <Link
      to={`/game/${game.igdbId}`}
      style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      <div style={{ position: 'relative' }}>
        <Cover w={140} h={186} src={game.coverUrl} label={(game.name.split(' ')[0] ?? game.name).toUpperCase()} />
        {game.userGame && (
          <div style={{
            position: 'absolute', top: 6, right: 6,
            background: 'var(--ink)', border: '1px solid var(--rule)',
            padding: '2px 6px', fontSize: 'var(--text-3xs)',
            color: isWishlist ? 'var(--amber)' : 'var(--paper-dim)',
            letterSpacing: '0.05em', textTransform: 'uppercase',
          }}>
            {isWishlist ? '★ wished' : 'owned'}
          </div>
        )}
      </div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--paper)', lineHeight: 1.3, overflow: 'hidden' }}>
        {game.name}
      </div>
      {game.announcementType && (
        <div className="t-mono t-faint" style={{ fontSize: 'var(--text-3xs)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {game.announcementType}
        </div>
      )}
      {isOwned && game.userGame && (
        <div className="t-mono t-dim" style={{ fontSize: 'var(--text-3xs)' }}>
          {game.userGame.status}
        </div>
      )}
    </Link>
  );
}
