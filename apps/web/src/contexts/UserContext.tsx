import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { AuthUser } from '@hoard/types';

export type AuthStatus = 'loading' | 'authed' | 'unauthed';

export interface UserContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  setUser: (user: AuthUser | null) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  const refresh = useCallback(async () => {
    try {
      const u = await api.me();
      setUserState(u);
      setStatus('authed');
    } catch {
      setUserState(null);
      setStatus('unauthed');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setUser = useCallback((u: AuthUser | null) => {
    setUserState(u);
    setStatus(u ? 'authed' : 'unauthed');
  }, []);

  const signOut = useCallback(async () => {
    try { await api.logout(); } catch { /* ignore */ }
    setUserState(null);
    setStatus('unauthed');
  }, []);

  const value = useMemo<UserContextValue>(
    () => ({ user, status, setUser, refresh, signOut }),
    [user, status, setUser, refresh, signOut],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used inside <UserProvider>');
  return ctx;
}
