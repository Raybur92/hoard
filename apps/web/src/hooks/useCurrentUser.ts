import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { AuthUser } from '@hoard/types';

export function useCurrentUser() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    api.me().then(setUser).catch(() => {});
  }, []);

  return user;
}
