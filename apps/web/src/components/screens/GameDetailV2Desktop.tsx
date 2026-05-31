/**
 * GD-PR1 — GameDetail v2 desktop dispatcher (PAGES_PLAN §3).
 *
 * Mounts at `/game/:igdbId`. Reads the state-classified payload via
 * `useGameByIgdb` and routes to the matching surface:
 *
 *   - S1 (released, not owned) → new `S1Desktop` component
 *   - S2 (upcoming, not owned) → S1Desktop for now (GD-PR2 ships dedicated
 *                                S2 surface with HeroCountdown + preorders)
 *   - S3 (owned, in-progress)  → legacy `GameDetailDesktop` with the
 *                                `userGameId` prop bypassing the URL param
 *   - S4 (owned, completed)    → legacy `GameDetailDesktop` (same as S3
 *                                until GD-PR4 adds the archivist relic)
 *
 * The URL stays `/game/:igdbId` regardless of state — no navigation,
 * no flicker. The "re-render in place" property on state transition
 * (S1 → S3 after add-to-library) falls out for free from React's normal
 * re-render on state change.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Btn } from '../primitives/Btn';
import { TopBar } from '../layout/TopBar';
import { useGameByIgdb } from '../../hooks/useGameByIgdb';
import { api } from '../../lib/api';
import { S1Desktop } from './gameDetail/S1Desktop';
import { GameDetailDesktop } from './GameDetailDesktop';

export function GameDetailV2Desktop() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [redirectError, setRedirectError] = useState(false);

  // The `:id` URL segment is either a numeric IGDB id (canonical, new) or
  // a legacy cuid (UserGame.id from the F1-PR6 deep-link era). When it's
  // a cuid, resolve it server-side + replace-navigate to the canonical
  // IGDB URL. The cuid pattern is /^c[a-z0-9]{20,}$/ (collision-resistant).
  const looksLikeCuid = id ? /^c[a-z0-9]{20,}$/i.test(id) : false;
  const igdbIdNum = id && !looksLikeCuid ? Number(id) : null;
  const validIgdbId = igdbIdNum !== null && Number.isInteger(igdbIdNum) && igdbIdNum > 0
    ? igdbIdNum
    : undefined;

  useEffect(() => {
    if (!id || !looksLikeCuid) return;
    let cancelled = false;
    setRedirectError(false);
    (async () => {
      try {
        const { igdbId } = await api.userGameIgdbId(id);
        if (!cancelled) navigate(`/game/${igdbId}`, { replace: true });
      } catch {
        // 404 / network failure — surface an error so the user sees a real
        // dead-end instead of an indefinite "// redirecting…" spinner.
        if (!cancelled) setRedirectError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [id, looksLikeCuid, navigate]);

  const { data, loading, error, refetch } = useGameByIgdb(validIgdbId);

  if (looksLikeCuid) {
    return (
      <>
        <TopBar crumbs={['hoard', '…']} />
        {redirectError ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 14 }}>
            <span className="t-mono t-red" style={{ fontSize: 'var(--text-xs)' }}>{`// game not found`}</span>
            <Btn sm onClick={() => navigate('/library')}>back to library</Btn>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <span className="t-mono t-faint" style={{ fontSize: 'var(--text-xs)' }}>{`// redirecting…`}</span>
          </div>
        )}
      </>
    );
  }

  if (!validIgdbId) {
    return (
      <>
        <TopBar crumbs={['hoard', '…']} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 14 }}>
          <span className="t-mono t-red" style={{ fontSize: 'var(--text-xs)' }}>{`// invalid game id`}</span>
          <span className="t-mono t-faint" style={{ fontSize: 'var(--text-2xs)' }}>{`url segment: "${id ?? '(missing)'}"`}</span>
          <Btn sm onClick={() => navigate('/library')}>back to library</Btn>
        </div>
      </>
    );
  }

  if (loading || !data) {
    return (
      <>
        <TopBar crumbs={['hoard', '…']} />
        {error
          ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 14 }}>
              <span className="t-mono t-red" style={{ fontSize: 'var(--text-xs)' }}>{`// failed to load game`}</span>
              <span className="t-mono t-faint" style={{ fontSize: 'var(--text-2xs)', maxWidth: 480, textAlign: 'center' }}>{error}</span>
              <Btn sm onClick={() => refetch()}>retry</Btn>
            </div>
          : <div style={{ padding: '24px 32px', display: 'grid', gridTemplateColumns: '260px 1fr', gap: 32 }}>
              <div className="skel" style={{ height: 347 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="skel" style={{ width: 240, height: 28 }} />
                <div className="skel" style={{ width: 160, height: 12 }} />
                <div className="skel" style={{ height: 80 }} />
                <div className="skel" style={{ height: 120 }} />
              </div>
            </div>
        }
      </>
    );
  }

  // Dispatch logic (GD-PR1):
  //   - status=Wishlist (any release date) → S1 surface with
  //     `wishlistUserGame` prop; CTAs adapt to "+ acquire" /
  //     "- remove from wishlist". Andrea's lock on the legacy S3
  //     surface: the "mark complete / start playing / + note / receipt"
  //     UI doesn't fit wishlist games (the user hasn't acquired the
  //     game yet — those CTAs are nonsensical).
  //   - no UserGame → S1 surface plain; "+ add to library" / "+ wishlist".
  //   - any other status (Playing / Backlog / OnHold / Dropped / Completed)
  //     → legacy GameDetail. GD-PR2/PR3/PR4 incrementally rewrite the
  //     legacy view for dedicated S2/S3/S4 surfaces.
  //
  // Per OQ-GD-12 the spec puts wishlist+future → S2 and wishlist+past
  // → S3; GD-PR1 collapses both onto the S1 surface as the transition
  // strategy until GD-PR2 ships the dedicated S2 (HeroCountdown) +
  // GD-PR3 folds price offers into S3.
  if (data.userGame && data.userGame.status !== 'Wishlist') {
    return <GameDetailDesktop userGameId={data.userGame.id} />;
  }
  // Conditional prop spread keeps exactOptionalPropertyTypes happy —
  // `wishlistUserGame` is omitted entirely when userGame is null.
  return data.userGame
    ? <S1Desktop game={data.game} wishlistUserGame={data.userGame} onMutated={refetch} />
    : <S1Desktop game={data.game} onMutated={refetch} />;
}
