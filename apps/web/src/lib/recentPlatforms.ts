// F1-PR1 platform picker — recently-used tracker.
//
// localStorage-backed. Per OQ-F1-9 + §4.5 of INTERACTION_FLOW, the
// Stage-2 picker pins recently-used platforms below the IGDB-suggested
// section. Cap at 5 entries; LRU (most-recent first); per-user storage
// is implicit because localStorage is per-browser.
//
// The list lives in the picker only — it does NOT influence the
// platform-binding logic on UserGame. It's pure UI pin convenience.

const STORAGE_KEY = 'hoard.recentPlatforms.v1';
const MAX_RECENT = 5;

/**
 * Read the recent-platforms list. Returns an empty array on any read
 * error (corrupt JSON, SSR context with no window, etc.). Never throws.
 */
export function getRecent(): string[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string').slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

/**
 * Push a platform label to the front of the recent-used list. Dedupes
 * (existing entries are removed from their old position, then prepended).
 * Trims to MAX_RECENT entries. Silently no-ops on storage errors.
 */
export function pushRecent(label: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  if (!label) return;
  try {
    const current = getRecent();
    const next = [label, ...current.filter((l) => l !== label)].slice(0, MAX_RECENT);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore — recent list is a pure UX optimization, not load-bearing */
  }
}

/**
 * Test-only — clear the storage. NOT exported through any production
 * surface; called only by test setup.
 */
export function _resetForTests(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
