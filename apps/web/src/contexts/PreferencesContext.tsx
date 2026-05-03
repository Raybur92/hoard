import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api } from '../lib/api';
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

export const PreferencesContext = createContext<PreferencesContextValue>({
  prefs: DEFAULT_PREFS,
  updatePref: async () => {},
});

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS);

  useEffect(() => {
    void api.me().then((user) => {
      if (user.preferences) setPrefs(user.preferences);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    document.body.classList.toggle('no-cursor', !prefs?.terminalCursor);
  }, [prefs?.terminalCursor]);

  const updatePref = useCallback(async (patch: Partial<UserPreferences>) => {
    const optimistic = { ...prefs, ...patch };
    setPrefs(optimistic);
    try {
      const updated = await api.updateMe(patch as PatchMeBody);
      setPrefs(updated.preferences);
    } catch {
      setPrefs(prefs);
    }
  }, [prefs]);

  return (
    <PreferencesContext.Provider value={{ prefs, updatePref }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  return useContext(PreferencesContext);
}
