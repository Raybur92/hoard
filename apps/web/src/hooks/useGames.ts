import { useState, useEffect } from 'react';
import { api, type GamesParams } from '../lib/api';
import type { GameListResponse } from '@hoard/types';

export function useGames(params?: GamesParams) {
  const [data, setData] = useState<GameListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const key = JSON.stringify(params);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.games(params)
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading, error };
}
