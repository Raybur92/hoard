import { useUser } from '../contexts/UserContext';
import type { AuthUser } from '@hoard/types';

export function useCurrentUser(): AuthUser | null {
  return useUser().user;
}
