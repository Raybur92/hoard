import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from '../lib/api';

type AuthState = 'loading' | 'authed' | 'unauthed';

export function RequireAuth({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>('loading');
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    api.me()
      .then(() => { if (!cancelled) setState('authed'); })
      .catch(() => { if (!cancelled) setState('unauthed'); });
    return () => { cancelled = true; };
  }, []);

  if (state === 'loading') {
    return <div className="hoard-noise" style={{ minHeight: '100vh' }} />;
  }
  if (state === 'unauthed') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
