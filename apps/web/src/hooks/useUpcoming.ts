import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import type { IgdbUpcomingRelease } from '@hoard/types';

export function useUpcoming(scope: 'my-platforms' | 'all' = 'my-platforms') {
  const [data, setData] = useState<IgdbUpcomingRelease[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.igdbUpcoming(scope)
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => {
        if (!cancelled) {
          api.upcoming()
            .then(d => {
              if (!cancelled) {
                const mapped: IgdbUpcomingRelease[] = d.map((w) => ({
                  igdbId: w.igdbId,
                  title: w.title,
                  developer: w.developer,
                  releaseDate: w.releaseDate,
                  releaseDateCategory: w.releaseDateCategory,
                  platforms: w.platforms,
                  genres: w.genres,
                  coverUrl: w.coverUrl,
                  synopsis: w.synopsis,
                  wishlisted: true,
                  category: 0,
                  hype: w.hype,
                }));
                setData(mapped);
                setLoading(false);
              }
            })
            .catch(e => { if (!cancelled) { setError(String(e)); setLoading(false); } });
        }
      });
    return () => { cancelled = true; };
  }, [rev, scope]);

  const refetch = useCallback(() => setRev((r) => r + 1), []);

  return { data, loading, error, refetch };
}
