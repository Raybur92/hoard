import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { EventGameRow } from '@hoard/types';
import { Cover } from '../../primitives/Cover';
import { Marker } from '../../primitives/Marker';
import { Btn } from '../../primitives/Btn';
import { Icon } from '../../primitives/Icon';
import { api } from '../../../lib/api';

export interface EventGameGridProps {
  games: EventGameRow[];
  /** Slug of the event being rendered — needed for the [load games] POST. */
  eventSlug: string;
  /** Null = never resolved (show button + zero-state). Non-null = resolved
   *  at the timestamp; empty `games` array now means "no games linked". */
  gamesResolvedAt: string | null;
  /** EV-D5 — when the list is sparse for a non-upcoming event, render the
   *  community-curated disclaimer above the grid. */
  showSparseDisclaimer?: boolean;
  /** Mobile shifts to 2-col grid per OQ-EV-9 (deferred for full mobile pass
   *  in EV-PR4 but applied here so the chrome is sized right today). */
  mobile?: boolean;
  /** Called after a successful resolve so the parent can refetch the
   *  detail payload (the api method invalidates the cache; the parent
   *  hook picks up the change). */
  onResolved?: () => void;
}

const SPARSE_THRESHOLD = 5;

export function EventGameGrid({
  games,
  eventSlug,
  gamesResolvedAt,
  showSparseDisclaimer,
  mobile,
  onResolved,
}: EventGameGridProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // EV-PR1 polish — unresolved state. Show [load games] button + zero-state.
  if (gamesResolvedAt === null) {
    return (
      <div className="panel" style={{ padding: 24, textAlign: 'center' }}>
        <Marker style={{ color: 'var(--paper-faint)' }}>
          // games · IGDB hasn't been queried yet
        </Marker>
        <div className="t-sans t-dim" style={{ fontSize: 'var(--text-sm)', marginTop: 8, marginBottom: 16 }}>
          {loading
            ? 'Resolving against IGDB — this can take a few seconds…'
            : 'Click below to fetch the list of games associated with this event.'}
        </div>
        {error && (
          <Marker style={{ color: 'var(--red)', marginBottom: 12 }}>
            // {error}
          </Marker>
        )}
        <Btn
          variant="amber"
          sm
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            setError(null);
            try {
              await api.resolveEventGames(eventSlug);
              onResolved?.();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'failed to load games');
              setLoading(false);
            }
          }}
        >
          <Icon name="download" size={11} />
          {loading ? 'loading games…' : '+ load games'}
        </Btn>
        {loading && <SkeletonGrid {...(mobile ? { mobile: true } : {})} />}
      </div>
    );
  }

  // Resolved + empty.
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

  // Resolved + populated.
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

/** Lightweight skeleton loader rendered while [load games] is in flight. */
function SkeletonGrid({ mobile }: { mobile?: boolean }) {
  const cols = mobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(140px, 1fr))';
  const count = mobile ? 4 : 6;
  return (
    <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: cols, gap: 16 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'flex', flexDirection: 'column', gap: 6,
            opacity: 0.4,
          }}
        >
          <div style={{ width: '100%', aspectRatio: '140 / 186', background: 'var(--ink-2)', border: '1px solid var(--rule)' }} />
          <div style={{ height: 10, background: 'var(--ink-2)', width: '80%' }} />
          <div style={{ height: 8, background: 'var(--ink-2)', width: '60%' }} />
        </div>
      ))}
    </div>
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
