import { api } from '../lib/api';
import { useQuery } from './useQuery';
import type { AdminInviteCode } from '@hoard/types';

/**
 * Admin-only — pulls all invite codes from `GET /api/admin/invite-codes`.
 * Server sorts: unused first (most-recently-created), then used
 * (most-recently-used). Cache key `admin:invite-codes` is invalidated by
 * `api.admin.createInviteCode` and `api.admin.deleteInviteCode` (wired in
 * apps/web/src/lib/api.ts).
 */
export function useAdminInviteCodes() {
  return useQuery<{ codes: AdminInviteCode[] }>(
    'admin:invite-codes',
    () => api.admin.listInviteCodes().then((codes) => ({ codes })),
  );
}
