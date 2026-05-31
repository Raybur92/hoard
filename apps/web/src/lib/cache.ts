/**
 * Tiny keyed cache with stale-while-revalidate semantics + localStorage
 * persistence so navigation feels instant across page reloads.
 *
 * Used by the `useQuery` hook to serve previously-fetched data immediately
 * while a background refetch runs. Mutations invalidate by key prefix.
 *
 * The in-memory `Map` is the source of truth at runtime; localStorage is
 * write-through on every `set()` and hydrated once on module load. Cold
 * page-load reads return cached data instantly, no API round-trip in the
 * paint path. SWR's stale-window logic in `useQuery` decides whether to
 * fire a background refetch based on the persisted `ts`.
 *
 * Not a general-purpose cache. Intentionally small. No size cap on the
 * in-memory side (tracked entry count is small — ~30 keys for a single
 * user session); localStorage writes guard against quota with a per-entry
 * size cap + try/catch.
 */

interface Entry {
  data: unknown;
  ts: number;
}

const store = new Map<string, Entry>();
const subs = new Map<string, Set<() => void>>();

/**
 * localStorage key prefix. Bump the `v1` suffix to invalidate every
 * persisted entry app-wide — e.g. after a breaking schema change in the
 * cached payload shape. Bumping does NOT migrate; old entries are simply
 * orphaned and eventually evicted by browser quota pressure (or
 * explicitly cleared in `_resetForTests`).
 */
const STORAGE_PREFIX = 'hoard:cache:v1:';

/**
 * Per-entry size cap when writing to localStorage (UTF-16 chars in the
 * JSON.stringify output). The browser quota is typically 5MB per origin;
 * we cap each entry at ~1.5MB to leave headroom for other entries +
 * accidental jumbo payloads. Oversized entries stay in-memory only.
 */
const MAX_PERSISTED_BYTES = 1_500_000;

export interface CacheEntry<T> {
  data: T;
  ts: number;
}

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

/**
 * Read every persisted entry into the in-memory store. Called once on
 * module load (which is once per page-load in the browser). Synchronous
 * by necessity — `useQuery` consumers may read on first render before
 * any async work resolves. Corrupt entries (JSON parse fails / wrong
 * shape) are silently skipped, not removed, so a future version with
 * fixed shape can still find them.
 */
function hydrate(): void {
  if (!hasStorage()) return;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const fullKey = localStorage.key(i);
      if (!fullKey?.startsWith(STORAGE_PREFIX)) continue;
      const raw = localStorage.getItem(fullKey);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as Partial<Entry>;
        if (typeof parsed?.ts !== 'number' || !('data' in parsed)) continue;
        const cacheKey = fullKey.slice(STORAGE_PREFIX.length);
        store.set(cacheKey, { data: parsed.data as unknown, ts: parsed.ts });
      } catch {
        // Corrupt entry — skip silently.
      }
    }
  } catch {
    // localStorage unavailable (private browsing rejects writes, sometimes
    // reads). Falling back to in-memory-only is the right behaviour.
  }
}

function persistEntry(key: string, entry: Entry): void {
  if (!hasStorage()) return;
  try {
    const serialized = JSON.stringify(entry);
    if (serialized.length > MAX_PERSISTED_BYTES) return; // in-memory only
    localStorage.setItem(STORAGE_PREFIX + key, serialized);
  } catch {
    // Quota exceeded / private-browsing / other write failure — degrade
    // gracefully to in-memory-only. We never throw from `set()`.
  }
}

function removeByPrefix(prefix: string): void {
  if (!hasStorage()) return;
  try {
    const matched: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const fullKey = localStorage.key(i);
      if (!fullKey?.startsWith(STORAGE_PREFIX)) continue;
      const cacheKey = fullKey.slice(STORAGE_PREFIX.length);
      if (cacheKey.startsWith(prefix)) matched.push(fullKey);
    }
    for (const k of matched) localStorage.removeItem(k);
  } catch { /* ignore */ }
}

export function get<T>(key: string): CacheEntry<T> | undefined {
  const e = store.get(key);
  return e ? { data: e.data as T, ts: e.ts } : undefined;
}

export function set<T>(key: string, data: T): void {
  const entry: Entry = { data, ts: Date.now() };
  store.set(key, entry);
  persistEntry(key, entry);
  emit(key);
}

/**
 * Drop every entry whose key starts with `prefix`, and notify their
 * subscribers so any active hooks refetch. Also removes persisted
 * entries from localStorage so a subsequent reload doesn't serve the
 * stale data.
 *
 * Examples:
 *   invalidate('games:')      // every cached games-list query
 *   invalidate('game:abc123') // a single game detail
 *   invalidate('dashboard')   // the dashboard payload + period variants
 */
export function invalidate(prefix: string): void {
  for (const key of Array.from(store.keys())) {
    if (key.startsWith(prefix)) store.delete(key);
  }
  removeByPrefix(prefix);
  for (const key of Array.from(subs.keys())) {
    if (key.startsWith(prefix)) emit(key);
  }
}

export function subscribe(key: string, fn: () => void): () => void {
  let s = subs.get(key);
  if (!s) {
    s = new Set();
    subs.set(key, s);
  }
  s.add(fn);
  return () => {
    s!.delete(fn);
    if (s!.size === 0) subs.delete(key);
  };
}

function emit(key: string): void {
  subs.get(key)?.forEach((fn) => {
    try { fn(); } catch { /* subscriber errors don't block other subscribers */ }
  });
}

/** Test helper: wipe everything. Not for app code. Also clears the
 *  persisted localStorage entries so tests start from a known state. */
export function _resetForTests(): void {
  store.clear();
  subs.clear();
  removeByPrefix('');
}

// Synchronous hydrate on module load. Fires once per browser page-load;
// subsequent re-imports (HMR, tests via _resetForTests) are no-ops on the
// hydrated map because the module-level `store` persists across imports.
hydrate();
