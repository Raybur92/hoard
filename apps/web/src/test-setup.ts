import '@testing-library/jest-dom';
import { beforeEach } from 'vitest';
import * as cache from './lib/cache';

// Global SWR cache reset between tests.
//
// The cache module at lib/cache.ts is a singleton (a `Map<string, ...>`
// + a `Map<string, Set<() => void>>` of subscribers). It is NOT touched
// by `vi.clearAllMocks()` because it isn't a mock — it's a real module
// that test components transitively use via `useQuery`.
//
// Without this global reset, every future test file that touches an
// SWR-backed hook would rediscover the same trap: earlier tests'
// resolved data leaks into later tests via cached entries, and
// stale subscribers fire callbacks against unmounted components.
// Caught while writing AdminScreen.test.tsx (8 of 14 tests failed
// until a per-file `cache.invalidate('')` was added in beforeEach;
// see I5 follow-up C in docs/INVITE_CODES_PLAN.md §6).
//
// `_resetForTests()` is the cache module's documented test escape
// hatch — clears both `store` and `subs`. Strictly more thorough
// than `invalidate('')`, which only handles the store half.
//
// `cache.test.ts` already calls `_resetForTests()` in its own
// beforeEach; the global hook makes that redundant but not wrong.
// Other test files no longer need to flush manually.
beforeEach(() => {
  cache._resetForTests();
});
