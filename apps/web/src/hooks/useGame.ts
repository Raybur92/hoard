import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { UserGameDetail } from '@hoard/types';

export function useGame(id: string | undefined) {
  const [data, setData] = useState<UserGameDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    let cancelled = false;
    api.game(id)
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [id]);

  return { data, loading, error };
}
