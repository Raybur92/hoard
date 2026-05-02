import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { WishlistRelease } from '@hoard/types';

export function useUpcoming() {
  const [data, setData] = useState<WishlistRelease[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.upcoming()
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  return { data, loading, error };
}
