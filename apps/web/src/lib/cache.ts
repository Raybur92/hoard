/**
 * Tiny in-memory keyed cache with stale-while-revalidate semantics.
 *
 * Used by the `useQuery` hook to serve previously-fetched data instantly
 * while a background refetch runs. Mutations invalidate by key prefix.
 *
 * Not a general-purpose cache. Intentionally small. No persistence — the
 * Service Worker handles offline. No size cap — tracked entry count is small
 * (< 30 keys for a single user session).
 */

interface Entry {
  data: unknown;
  ts: number;
}

const store = new Map<string, Entry>();
const subs = new Map<string, Set<() => void>>();

export interface CacheEntry<T> {
  data: T;
  ts: number;
}

export function get<T>(key: string): CacheEntry<T> | undefined {
  const e = store.get(key);
  return e ? { data: e.data as T, ts: e.ts } : undefined;
}

export function set<T>(key: string, data: T): void {
  store.set(key, { data, ts: Date.now() });
  emit(key);
}

/**
 * Drop every entry whose key starts with `prefix`, and notify their
 * subscribers so any active hooks refetch.
 *
 * Examples:
 *   invalidate('games:')      // every cached games-list query
 *   invalidate('game:abc123') // a single game detail
 *   invalidate('dashboard')   // the dashboard payload
 */
export function invalidate(prefix: string): void {
  for (const key of Array.from(store.keys())) {
    if (key.startsWith(prefix)) store.delete(key);
  }
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

/** Test helper: wipe everything. Not for app code. */
export function _resetForTests(): void {
  store.clear();
  subs.clear();
}
