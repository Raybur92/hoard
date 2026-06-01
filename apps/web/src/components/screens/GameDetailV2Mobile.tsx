/**
 * GD-PR1 — GameDetail v2 mobile dispatcher. Mirrors the desktop dispatcher
 * topology — same state detection, same cuid → IGDB redirect, same
 * S1/S2 (new) vs S3/S4 (legacy via prop) split.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MobileHeader } from '../layout/MobileHeader';
import { Btn } from '../primitives/Btn';
import { useGameByIgdb } from '../../hooks/useGameByIgdb';
import { api } from '../../lib/api';
import { S1Mobile } from './gameDetail/S1Mobile';
import { S2Mobile } from './gameDetail/S2Mobile';
import { GameDetailMobile } from './GameDetailMobile';

export function GameDetailV2Mobile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [redirectError, setRedirectError] = useState(false);

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
        if (!cancelled) setRedirectError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [id, looksLikeCuid, navigate]);

  const { data, loading, error, refetch } = useGameByIgdb(validIgdbId);

  if (looksLikeCuid) {
    return (
      <>
        <MobileHeader title="…" back />
        {redirectError ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <span className="t-mono t-red" style={{ fontSize: 'var(--text-xs)' }}>{`// game not found`}</span>
            <Btn sm onClick={() => navigate('/library')}>back to library</Btn>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="t-mono t-faint" style={{ fontSize: 'var(--text-xs)' }}>{`// redirecting…`}</span>
          </div>
        )}
      </>
    );
  }

  if (!validIgdbId) {
    return (
      <>
        <MobileHeader title="game" back />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
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
        <MobileHeader title="…" back />
        {error
          ? <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <span className="t-mono t-red" style={{ fontSize: 'var(--text-xs)' }}>{`// failed to load game`}</span>
              <Btn sm onClick={() => refetch()}>retry</Btn>
            </div>
          : <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
              <div className="skel" style={{ width: 180, height: 240 }} />
              <div className="skel" style={{ width: 180, height: 28 }} />
              <div className="skel" style={{ width: '90%', height: 120 }} />
            </div>
        }
      </>
    );
  }

  // Same dispatch as GameDetailV2Desktop — see that file for the full
  // rationale. GD-PR2 adds the S2 surface for upcoming (future-release)
  // games whether wishlisted or not. GD-PR4b polish: Completed games
  // stay on the legacy surface; the relic lives as a button-triggered
  // overlay inside it.
  if (data.userGame && data.userGame.status !== 'Wishlist') {
    return <GameDetailMobile userGameId={data.userGame.id} />;
  }

  if (data.state === 'S2') {
    return data.userGame
      ? <S2Mobile game={data.game} wishlistUserGame={data.userGame} onMutated={refetch} />
      : <S2Mobile game={data.game} onMutated={refetch} />;
  }

  return data.userGame
    ? <S1Mobile game={data.game} wishlistUserGame={data.userGame} onMutated={refetch} />
    : <S1Mobile game={data.game} onMutated={refetch} />;
}
