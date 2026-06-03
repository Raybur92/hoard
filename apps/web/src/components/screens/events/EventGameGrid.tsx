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

  // Resolved + empty. Could mean IGDB truly has no games for this event,
  // OR community curation hadn't caught up at resolve time (common for
  // events the day-of). Surface a [check again] button so the user can
  // retry once curation lands without us guessing a refresh cadence.
  if (games.length === 0) {
    const lastChecked = gamesResolvedAt
      ? new Date(gamesResolvedAt).toLocaleString(undefined, {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        })
      : null;
    return (
      <div className="panel" style={{ padding: 24, textAlign: 'center' }}>
        <Marker>// no games linked to this event yet</Marker>
        <div className="t-sans t-dim" style={{ fontSize: 'var(--text-sm)', marginTop: 8, marginBottom: 16 }}>
          IGDB's game list for this event is community-curated.
          {lastChecked && ` Last checked: ${lastChecked}.`}
        </div>
        {error && (
          <Marker style={{ color: 'var(--red)', marginBottom: 12 }}>
            // {error}
          </Marker>
        )}
        <Btn
          sm
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            setError(null);
            try {
              await api.resolveEventGames(eventSlug);
              onResolved?.();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'failed to refresh');
              setLoading(false);
            }
          }}
        >
          <Icon name="refresh" size={11} />
          {loading ? 'checking…' : 'check again'}
        </Btn>
        {loading && <SkeletonGrid {...(mobile ? { mobile: true } : {})} />}
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

/** Lightweight skeleton loader rendered while [load games] is in flight.
 *  Uses the existing `.skel` class (global.css :740) for the breathing
 *  opacity 0.3 → 0.55 pulse, so the skeleton feels alive rather than
 *  flatly idle. */
function SkeletonGrid({ mobile }: { mobile?: boolean }) {
  const cols = mobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(140px, 1fr))';
  const count = mobile ? 4 : 6;
  return (
    <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: cols, gap: 16 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="skel" style={{ width: '100%', aspectRatio: '140 / 186' }} />
          <div className="skel" style={{ height: 10, width: '80%' }} />
          <div className="skel" style={{ height: 8, width: '60%' }} />
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
      <div style={{
        fontSize: 'var(--text-xs)',
        color: 'var(--paper)',
        lineHeight: 1.3,
        // Predictable card heights across the grid — long titles cap at
        // 2 lines with ellipsis instead of wrapping to 3+ inconsistently.
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
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
