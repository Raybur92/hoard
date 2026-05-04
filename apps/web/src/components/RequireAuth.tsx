import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useUser();
  const location = useLocation();

  if (status === 'loading') {
    return <div className="hoard-noise" style={{ minHeight: '100vh' }} />;
  }
  if (status === 'unauthed') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
