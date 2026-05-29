import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useUser } from '../../contexts/UserContext';
import { AdminLayout } from './admin/AdminLayout';
import { MobileFallback, NotFoundView } from './admin/shared';

/**
 * Admin panel route gate. Closed-beta workstream I5 originally landed
 * this as a single 1300-line monolith; the admin-IA redesign (2026-05-29)
 * split it into 5 sub-routes (/admin/pending, /admin/users, /admin/codes,
 * /admin/feedback, /admin/events) under a shared `AdminLayout` with a
 * sidebar + count badges. This component remains the entry point —
 * handles auth + breakpoint + admin-flag guards, then hands off to
 * the layout which renders <Outlet /> for the active sub-route.
 *
 * Desktop-only per I-D3 — below 1024px renders a centered terminal-style
 * fallback rather than a mobile parity port. Reasoning unchanged from
 * the original I5 design: admin work is rare and laptop-friendly.
 *
 * Defense-in-depth: checks `currentUser.isAdmin` and renders a 404 view
 * for non-admins. Sidebar already hides the entry, but typing /admin in
 * the URL bar shouldn't reveal what's there. The server returns 404 (not
 * 403) on /api/admin/* for non-admins per I-D15.
 */
export function AdminScreen() {
  useDocumentTitle('hoard · admin');
  const bp = useBreakpoint();
  const { user } = useUser();

  if (bp !== 'desktop') {
    return <MobileFallback />;
  }

  if (!user?.isAdmin) {
    return <NotFoundView />;
  }

  return <AdminLayout />;
}

export default AdminScreen;
