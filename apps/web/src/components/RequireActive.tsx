import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';

/**
 * Closed-beta gate (docs/INVITE_CODES_PLAN.md I4). Sits INSIDE
 * RequireAuth: by the time we render here we know there's an
 * authenticated user; we just need to check whether they've redeemed
 * an invite code. Pending users get redirected to
 * `/welcome?next=<original-path>` so the welcome screen can land them
 * back where they were trying to go after redemption.
 *
 * Active users pass through. The /welcome route itself is wrapped in
 * RequireAuth but NOT RequireActive — pending users have to be able to
 * reach it without bouncing in a loop.
 */
export function RequireActive({ children }: { children: ReactNode }) {
  const { user, status } = useUser();
  const location = useLocation();

  if (status === 'loading') {
    return <div className="hoard-noise" style={{ minHeight: '100vh' }} />;
  }

  if (user && user.status !== 'ACTIVE') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/welcome?next=${next}`} replace />;
  }

  return <>{children}</>;
}
