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
    // Encode the original path + search into ?next= so LoginScreen can
    // read it via useSearchParams() and forward the user to the deep
    // link after auth. URL query string is the single channel both
    // /login and /welcome use for this purpose — sharing the
    // mechanism keeps the redirect plumbing predictable.
    //
    // Why not router state ({ from: ... }): LoginScreen reads
    // useSearchParams() (URL query), not useLocation().state. The
    // pre-fix `state={{ from: ... }}` channel was an orphan — nothing
    // in the app consumed it. Verified via grep before changing.
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <>{children}</>;
}
