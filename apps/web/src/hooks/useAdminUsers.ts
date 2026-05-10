import { api } from '../lib/api';
import { useQuery } from './useQuery';
import type { AdminUser } from '@hoard/types';

/**
 * Admin-only — pulls the full user listing from `GET /api/admin/users`.
 * Server already sorts: pending-with-request first (by accessRequestedAt
 * desc), then everyone else (by createdAt desc). The frontend renders
 * row-by-row in the order returned.
 *
 * Cache key `admin:users` is prefix-friendly for `cache.invalidate('admin:')`
 * after a code generate / revoke (admin actions can change pending-request
 * row state — generating a code for Marco doesn't flip his status, but
 * being explicit about the dependency keeps refresh correctness simple).
 */
export function useAdminUsers() {
  return useQuery<{ users: AdminUser[] }>(
    'admin:users',
    () => api.admin.listUsers().then((users) => ({ users })),
  );
}
