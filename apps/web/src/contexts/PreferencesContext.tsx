import { createContext, useContext, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { api } from '../lib/api';
import { useUser } from './UserContext';
import type { UserPreferences, PatchMeBody } from '@hoard/types';

const DEFAULT_PREFS: UserPreferences = {
  hypeThreshold: 5,
  libraryView: 'shelves',
  showHltb: true,
  coverDensity: 'standard',
  terminalCursor: true,
};

interface PreferencesContextValue {
  prefs: UserPreferences;
  updatePref: (patch: Partial<UserPreferences>) => Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextValue>({
  prefs: DEFAULT_PREFS,
  updatePref: async () => {},
});

export { PreferencesContext };

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user, setUser } = useUser();
  const prefs = user?.preferences ?? DEFAULT_PREFS;

  useEffect(() => {
    document.body.classList.toggle('no-cursor', !prefs.terminalCursor);
  }, [prefs.terminalCursor]);

  const updatePref = useCallback(async (patch: Partial<UserPreferences>) => {
    if (!user) return;
    const optimistic = { ...user, preferences: { ...prefs, ...patch } };
    setUser(optimistic);
    try {
      const updated = await api.updateMe(patch as PatchMeBody);
      setUser(updated);
    } catch {
      setUser(user);
    }
  }, [user, prefs, setUser]);

  const value = useMemo(() => ({ prefs, updatePref }), [prefs, updatePref]);

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePreferences() {
  return useContext(PreferencesContext);
}
