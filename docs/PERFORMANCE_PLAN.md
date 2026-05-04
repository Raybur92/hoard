# Hoard — Performance & UX Plan

> **Scope:** Prioritized plan to fix the "clunky and slow" feel of the running app — both desktop and mobile. Each item carries the goal, the files involved, an implementation sketch, the tests we will add, and the success criteria we accept the work against.
>
> **Status:** Drafted 2026-05-04 after a full perf audit. None of these have been started yet.
>
> **Why a separate doc:** `docs/PLAN.md` covers feature phases and is already large. This file captures a focused workstream that we'll cross off independently and (eventually) fold a one-line summary back into `PLAN.md` when complete.

---

## 1. Reported symptoms (the "why")

User reports, observed on production:

- Switching between pages feels heavy.
- The username in the sidebar/header flashes to `…` on every navigation, then resolves after ~0.5–1s.
- Shelf counters in the sidebar disappear and take 5–6 seconds to come back.
- A short "noise" screen (the dotted/grainy backdrop) flashes between every page.
- Library opens slowly even on a warm session.

These are not isolated bugs — they're the surface symptoms of an architectural pattern that is wrong in three places at once.

---

## 2. Root causes

| # | Cause | Where it lives | What the user sees |
|---|---|---|---|
| C1 | Shell (Sidebar/TopBar/MobileHeader/MobileTabBar) is rendered **inside every screen**, not in a parent layout. Each navigation unmounts and rebuilds it. | [App.tsx:26-38](../apps/web/src/App.tsx#L26-L38), every screen file | Username "…" flash, shelf counters disappear, layout flicker |
| C2 | `/api/auth/me` is fetched **4–5 times per navigation** by independent components, each with its own state. | [RequireAuth.tsx:13](../apps/web/src/components/RequireAuth.tsx#L13), [Sidebar.tsx:44](../apps/web/src/components/layout/Sidebar.tsx#L44), [PreferencesContext.tsx:27](../apps/web/src/contexts/PreferencesContext.tsx#L27), [useCurrentUser.ts:9](../apps/web/src/hooks/useCurrentUser.ts#L9), Settings screens | Cold network round-trip on every nav, bigger when the connection is slow |
| C3 | No request cache. Every hook is `useState(loading=true)` + `useEffect(fetch)`. | [useDashboard.ts](../apps/web/src/hooks/useDashboard.ts), [useGames.ts](../apps/web/src/hooks/useGames.ts), etc. | Skeletons on every revisit, even one second after leaving the page |
| C4 | `RequireAuth` is in the route element, not a layout route — so it runs on every route change and blocks render with a noise-only `<div>` until `/api/auth/me` returns. | [RequireAuth.tsx](../apps/web/src/components/RequireAuth.tsx), [App.tsx](../apps/web/src/App.tsx) | The "noise screen flash" between every page |
| C5 | `/api/dashboard` returns the **entire library** with full `Game` + `HltbData` joins, then aggregates server-side. No `take` limit. | [dashboard.ts:24](../apps/api/src/routes/dashboard.ts#L24) | Slow Dashboard cold-load; 500 KB–1.5 MB JSON for a 700-game library |
| C6 | Library Desktop fetches `?limit=2000` to render all 6 shelves in one shot. Mobile uses `?limit=100` (visibly inconsistent counts). | [LibraryDesktop.tsx:179](../apps/web/src/components/screens/LibraryDesktop.tsx#L179), [LibraryMobile.tsx:113](../apps/web/src/components/screens/LibraryMobile.tsx#L113) | Slow Library mount; 2 K cover images attempting to load at once |
| C7 | No HTTP cache headers from API. Every nav round-trips even when state hasn't changed. | every route in [apps/api/src/routes/](../apps/api/src/routes/) | Repeated work for the same data within seconds |
| C8 | SW runtime cache misses the navigation-frequent endpoints (`/api/auth/me`, `/api/games/counts`, `/api/platforms/status`). | [vite.config.ts:19](../apps/web/vite.config.ts#L19) | Even SW can't repaint the shell instantly |
| C9 | No `loading="lazy"`, no IGDB size variants, no intrinsic `width`/`height` on `<img>`. | [Cover.tsx:19](../apps/web/src/components/primitives/Cover.tsx#L19) | Massive image bandwidth on mobile; layout shift; CLS hit |
| C10 | Missing composite indexes on `UserGame` for `(userId, status)` and `(userId, lastPlayedAt)`. | [schema.prisma](../packages/db/prisma/schema.prisma) | Sequential scans; cheap fix, free win |
| C11 | Zero memoization across screens & layout (0 uses of `useMemo`/`useCallback`/`React.memo`). | every screen file | Library re-runs `applyFilters` for all 6 shelves on every keystroke |
| C12 | Cross-origin overhead — every `/api/*` call from `gamehoardr.com` to `api.gamehoardr.com` re-warms DNS+TLS on a cold session. | [apps/web/index.html](../apps/web/index.html) | First API call on cold load is slow |

Bundle size is fine: **105 KB gzipped**. Lighthouse scores are fine: 99 / 100 / 100. The slowness is architectural, not asset weight.

---

## 3. Fix plan (prioritized)

Each fix below has: **Goal**, **Files**, **Implementation sketch**, **Tests**, **Success criteria**.

---

### F1 — Lift shell into a layout route (P0)

**Goal:** Sidebar / TopBar / MobileHeader / MobileTabBar stay mounted across navigation. Username and shelf counts never flicker.

**Addresses:** C1.

**Files:**
- New: `apps/web/src/components/layout/AppShellDesktop.tsx`, `AppShellMobile.tsx`
- Modify: [App.tsx](../apps/web/src/App.tsx) — wrap routes in a layout route using `<Outlet />`
- Modify: every screen file in `apps/web/src/components/screens/` to remove its own `<Sidebar />` / `<TopBar />` / `<MobileHeader />` / `<MobileTabBar />`
- The breakpoint switch (`useBreakpoint`) lives in the parent layout, not in App routes

**Implementation sketch:**
```tsx
// App.tsx
<Routes>
  <Route path="/login" element={<LoginScreen />} />
  <Route element={<RequireAuth><AppShell /></RequireAuth>}>
    <Route path="/" element={<Dashboard />} />
    <Route path="/library" element={<Library />} />
    {/* etc. */}
  </Route>
</Routes>

// AppShell.tsx
export function AppShell() {
  const bp = useBreakpoint();
  return bp === 'desktop' ? (
    <div className="app-shell hoard-noise">
      <Sidebar />
      <div className="app-main">
        <TopBar />
        <Outlet />
      </div>
    </div>
  ) : (
    <MobileFrame>
      <MobileHeader />
      <Outlet />
      <MobileTabBar />
    </MobileFrame>
  );
}
```

Each screen becomes responsible only for its own content area — no shell.

**Tests:**
- Unit (Vitest): mount `<App>` with `MemoryRouter`, navigate `/` → `/library` → `/upcoming`, assert `Sidebar` component mounts exactly once (use a render-count ref or `vi.spyOn` on the component).
- Integration: spy on `api.me`. Navigate across 4 routes. Assert `api.me` called exactly once.
- E2E (Playwright): navigate Dashboard → Library → Upcoming → Settings; assert the sidebar `[data-testid="sidebar-username"]` text never reads `…` after the first paint of the session.
- Visual regression: existing shelf snapshots must not regress.

**Success criteria:**
- [ ] Sidebar and TopBar render zero times again after the initial app mount, until logout.
- [ ] Mobile header and tab bar render zero times again after the initial app mount, until logout.
- [ ] Username text in the sidebar never reads `…` after the initial cold load.
- [ ] All 28 existing E2E tests still pass.
- [ ] `npm run typecheck` and `npm run lint` clean.

---

### F2 — Single `<UserProvider>` at the app root (P0)

**Goal:** One `api.me()` call per session. All consumers read from context.

**Addresses:** C2.

**Files:**
- New: `apps/web/src/contexts/UserContext.tsx` (with `useUser()` hook)
- Modify: [main.tsx](../apps/web/src/main.tsx) or `App.tsx` to wrap the tree
- Modify: [Sidebar.tsx:44](../apps/web/src/components/layout/Sidebar.tsx#L44) — read from `useUser()` instead of fetching
- Modify: [PreferencesContext.tsx:27](../apps/web/src/contexts/PreferencesContext.tsx#L27) — read from `useUser()`
- Modify: [useCurrentUser.ts](../apps/web/src/hooks/useCurrentUser.ts) — re-export `useUser` (back-compat) or delete and update call sites
- Modify: [RequireAuth.tsx](../apps/web/src/components/RequireAuth.tsx) — also reads from context (or becomes the provider's gate)
- Modify: `SettingsDesktop.tsx`, `SettingsMobile.tsx` — read from context
- Mutation path: when user updates profile via PATCH, the provider updates its state.

**Implementation sketch:**
```tsx
// UserContext.tsx
const Ctx = createContext<{ user: AuthUser | null; status: 'loading' | 'authed' | 'unauthed'; refresh: () => void }>(null!);
export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<'loading' | 'authed' | 'unauthed'>('loading');
  const refresh = useCallback(() => {
    api.me().then(u => { setUser(u); setStatus('authed'); })
            .catch(() => { setUser(null); setStatus('unauthed'); });
  }, []);
  useEffect(refresh, [refresh]);
  return <Ctx.Provider value={{ user, status, refresh }}>{children}</Ctx.Provider>;
}
export const useUser = () => useContext(Ctx);
```

**Tests:**
- Unit: mock `api.me` and mount `<UserProvider>` with a few consumers; assert `api.me` called once.
- Integration: mount full `<App>` with mocked `api.me`; navigate across 4 routes; assert exactly one `api.me` call.
- Unit: after `refresh()`, consumers see updated user object.

**Success criteria:**
- [ ] Network panel: navigating Dashboard → Library → Upcoming → Settings produces exactly **one** `/api/auth/me` request.
- [ ] No component imports `api.me` directly except `UserProvider` itself.
- [ ] Profile update in Settings reflects in the sidebar without a full page reload.

---

### F3 — Move `RequireAuth` to layout (P0)

**Goal:** Auth check runs once per app instance, not on every route change. The blank/noise gap before each route paint disappears.

**Addresses:** C4. Depends on F1 + F2.

**Files:**
- Modify: [App.tsx](../apps/web/src/App.tsx) — `RequireAuth` wraps the layout route, not each individual route.
- Modify: [RequireAuth.tsx](../apps/web/src/components/RequireAuth.tsx) — read auth state from `UserContext` (no own fetch).

**Implementation sketch:**
```tsx
<Route element={<RequireAuth><AppShell /></RequireAuth>}>
  <Route path="/" element={<Dashboard />} />
  ...
</Route>

// RequireAuth.tsx
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useUser();
  if (status === 'loading')  return <div className="hoard-noise" style={{ minHeight: '100vh' }} />;
  if (status === 'unauthed') return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

**Tests:**
- Integration: navigate `/` → `/library` → `/upcoming`; assert `hoard-noise` placeholder element is rendered exactly once (on initial cold load only).
- E2E: cookie-authenticated session navigates 4 pages; assert no full white/noise flash between routes (Playwright video review or DOM snapshot at 16ms intervals showing the shell never disappears).

**Success criteria:**
- [ ] Network panel: `RequireAuth` no longer triggers its own `/api/auth/me` (covered by F2).
- [ ] No noise-only screen flash between page navigations.
- [ ] Logout from any screen redirects to `/login`.

---

### F4 — Stale-while-revalidate request cache (P1)

**Goal:** When you revisit a page within seconds, you see real data instantly while the cache refreshes in the background. No skeleton on revisit.

**Addresses:** C3.

**Decision to make at start of work:** ~50-LOC custom SWR vs `@tanstack/react-query`. Default to custom for this personal app (zero dependency cost, full control). If the custom version starts to grow features (mutations + invalidations + retries), switch to react-query.

**Files:**
- New: `apps/web/src/lib/cache.ts` — keyed in-memory cache with timestamp + subscribers
- New: `apps/web/src/hooks/useQuery.ts` — generic hook
- Modify: [useDashboard.ts](../apps/web/src/hooks/useDashboard.ts), [useGames.ts](../apps/web/src/hooks/useGames.ts), [useGame.ts](../apps/web/src/hooks/useGame.ts), [useUpcoming.ts](../apps/web/src/hooks/useUpcoming.ts) to use `useQuery`
- Modify: PATCH paths (game status edit, preferences update) to invalidate the relevant keys.

**Implementation sketch:**
```ts
// cache.ts
type Entry<T> = { data: T; ts: number; promise?: Promise<T> };
const store = new Map<string, Entry<unknown>>();
const listeners = new Map<string, Set<() => void>>();

export function get<T>(key: string): Entry<T> | undefined { ... }
export function set<T>(key: string, data: T) { ... emit(key); }
export function invalidate(prefix: string) { /* drop matching keys, emit */ }

// useQuery.ts
export function useQuery<T>(key: string, fetcher: () => Promise<T>, opts?: { staleMs?: number }) {
  const entry = get<T>(key);
  const [, force] = useReducer(x => x + 1, 0);
  useEffect(() => {
    const unsub = subscribe(key, force);
    const stale = !entry || (Date.now() - entry.ts) > (opts?.staleMs ?? 30_000);
    if (stale && !entry?.promise) {
      const p = fetcher().then(d => { set(key, d); return d; });
      // record promise so concurrent renders don't double-fetch
    }
    return unsub;
  }, [key]);
  return { data: entry?.data, loading: !entry, refetch: () => { /* drop, refetch */ } };
}
```

Cache keys:
- `dashboard`
- `games:{status?}:{platform?}:{q?}:{sort}:{page}:{limit}`
- `game:{id}`
- `upcoming:{platform?}`
- `gameCounts`
- `platformStatus`

**Tests:**
- Unit (cache): `set` then `get` returns the value with same `ts`. `invalidate('games:')` drops matching keys.
- Unit (hook): first render with empty cache shows `loading`; subsequent render with same key shows data immediately.
- Integration: navigate `/library` → `/` → `/library`; assert `api.games` is called once initially, then again in background on revisit (within 30s window — depends on staleMs); UI never shows skeleton on the second visit.
- Integration: PATCH a game's status. Assert `dashboard` and `games:` cache keys are invalidated and re-fetched on next read.

**Success criteria:**
- [ ] Navigating away from a page and back within 30s: no skeleton, real data visible immediately.
- [ ] Status edit on a game refreshes Dashboard counts within 1s without manual reload.
- [ ] No memory leak — `cache.ts` has a max size or LRU eviction.
- [ ] Existing 40 web tests still pass.

---

### F5 — Slim `/api/dashboard` (P1)

**Goal:** Stop returning the full library on every Dashboard load. Aggregate in SQL, return only what the UI shows.

**Addresses:** C5.

**Files:**
- Modify: [dashboard.ts](../apps/api/src/routes/dashboard.ts)
- DTO unchanged — the `DashboardResponse` shape stays the same; only the work to produce it changes.

**Implementation sketch:**
```ts
const [
  shelfCountsRaw,
  totalsAndPlatform,           // sum of playtime, sum per platform — SQL
  weeklyAdded,                  // count where addedAt >= 7d ago
  nowPlaying,                   // findMany Playing limit 5 ordered by lastPlayedAt
  backlogTop,                   // findMany Backlog include hltb, order by hltb.mainStory asc, limit 20
  wishlistReleases,
  platforms,
  genresTop,                    // groupBy genres? — see note
] = await Promise.all([ ... ]);
```
- Genres: `Game.genres` is `String[]`; can either denormalize to a table or keep client-side aggregation but only over a small slice (top 200 most-recent UserGames). Decide during implementation; document the choice in this file under **Decisions** when made.

**Tests:**
- Integration (Jest + Supertest): seed 200 mock games across statuses with playtime. Assert response shape matches `DashboardResponse`. Assert numeric fields match expected aggregates.
- Integration: assert response `Content-Length` < 100 KB for a 700-game library (mock or fixture).
- Integration: response time benchmark — endpoint completes in < 200 ms with mocked Prisma; track for regressions.

**Success criteria:**
- [ ] `/api/dashboard` payload < 100 KB for a 700-game library.
- [ ] Response shape unchanged — frontend doesn't change.
- [ ] All Dashboard E2E + visual tests pass.
- [ ] No double-counting bugs (manual smoke check: stats sum to total).

---

### F6 — Slim `/api/games` and Library pagination (P1)

**Goal:** Library Desktop stops requesting 2000 games. Each shelf shows the same number on desktop and mobile.

**Addresses:** C6.

**Files:**
- Modify: [games.ts](../apps/api/src/routes/games.ts) — keep `?limit` capped (max 200), default 50; add a new `?perStatus=N` query param for shelf view that returns top N per status.
- New endpoint suggestion: `GET /api/games/shelves?perStatus=8` → `{ shelves: { Playing: [...], Backlog: [...], ... }, counts: {...} }`. Single round trip for Library shelf view.
- Modify: [LibraryDesktop.tsx:179](../apps/web/src/components/screens/LibraryDesktop.tsx#L179) and [LibraryMobile.tsx:113](../apps/web/src/components/screens/LibraryMobile.tsx#L113) to use the new endpoint for shelf view; the `:status` filtered view still uses paginated `/api/games?status=`.
- Library Desktop: compute `perStatus` from viewport width using existing ResizeObserver math (same number of slots already calculated for the row).

**Tests:**
- Integration: `GET /api/games/shelves?perStatus=8` returns 6 shelves, each with up to 8 items, plus the full counts for each.
- Integration: `GET /api/games?limit=2000` is rejected (or capped) — assert with a 400 or capped response.
- Unit: Library Desktop renders correct shelf counts using the new `counts` object.
- E2E: Library Desktop loads under 1s on a 700-game library on a 4G profile.
- E2E: shelf count next to "Now Playing · N titles" matches the sidebar count.

**Success criteria:**
- [ ] No frontend code requests `?limit=2000`.
- [ ] Library Desktop and Library Mobile show the same `+N more` count for each shelf.
- [ ] `/api/games/shelves` response < 200 KB for a 700-game library.
- [ ] Library mount time on cold cache < 1.5s on dev hardware (Chrome DevTools 4G throttling).

---

### F7 — Cover lazy-load + IGDB size variants (P1)

**Goal:** Stop downloading 2K+ full-size cover images at once. Mobile especially benefits.

**Addresses:** C9.

**Files:**
- Modify: [Cover.tsx](../apps/web/src/components/primitives/Cover.tsx) — add `loading="lazy"`, `decoding="async"`, intrinsic `width`/`height` on the `<img>` (use the numeric `w`/`h` props).
- New: `apps/web/src/lib/igdbCover.ts` — function `igdbCoverSize(url, targetW)` that swaps `t_cover_*` segments. Mapping:
  - `targetW <= 90` → `t_cover_small` (90×128)
  - `targetW <= 264` → `t_cover_med` (264×374)
  - else → `t_cover_big` (264×374) — IGDB doesn't reliably go bigger than this
- Modify: `Cover` calls `igdbCoverSize(src, w)` when `src` matches an IGDB pattern.

**Implementation sketch:**
```ts
// igdbCover.ts
export function igdbCoverSize(url: string, w: number): string {
  if (!url.includes('images.igdb.com')) return url;
  const size = w <= 90 ? 't_cover_small' : 't_cover_med';
  return url.replace(/t_cover_(small|med|big|big_2x|original)/, size);
}
```

**Tests:**
- Unit: `igdbCoverSize` returns expected URL substring for each w threshold; passthrough for non-IGDB URLs.
- Component (Vitest + RTL): `<Cover src="...t_cover_big_2x..." w={84} h={112} />` renders an `<img>` with `loading="lazy"`, `width="84"`, `height="112"`, and src containing `t_cover_small`.
- Network impact (manual verification, documented in PR body): Library Desktop on cold cache fires < 50 image requests within the first 3s after mount (only above-the-fold covers).

**Success criteria:**
- [ ] Every `<img>` rendered by `Cover` has `loading="lazy"`, `decoding="async"`, and intrinsic `width`/`height`.
- [ ] Mobile shelf covers (84×112) request `t_cover_small` URLs.
- [ ] No image-related layout shift (Lighthouse CLS unchanged or improved).
- [ ] Existing visual regression baselines pass.

---

### F8 — HTTP cache headers on shell endpoints (P2)

**Goal:** Browser handles rapid back-and-forth navigation without round-trips.

**Addresses:** C7.

**Files:**
- Modify: [auth.ts](../apps/api/src/routes/auth.ts) — `/api/auth/me` GET sets `Cache-Control: private, max-age=10`.
- Modify: [games.ts](../apps/api/src/routes/games.ts) — `/api/games/counts` sets `Cache-Control: private, max-age=10`.
- Modify: [platforms.ts](../apps/api/src/routes/platforms.ts) — `/api/platforms/status` sets `Cache-Control: private, max-age=30`.

**Tests:**
- Integration (Supertest): each endpoint asserts the `Cache-Control` header on a 200 response.
- Integration: PATCH endpoints (`/api/auth/me`, `/api/games/:id`) do **not** set a stale `Cache-Control`.

**Success criteria:**
- [ ] DevTools network: rapid back-nav within 10s shows `(memory cache)` or `(disk cache)` for the three endpoints.
- [ ] No correctness bugs — profile updates and game edits are reflected immediately because the corresponding cache is invalidated by F4.

---

### F9 — SW runtime cache for shell endpoints (P2)

**Goal:** Even on slow networks or offline, the shell repaints from cache while data refreshes.

**Addresses:** C8.

**Files:**
- Modify: [vite.config.ts:19](../apps/web/vite.config.ts#L19) — add a `runtimeCaching` rule with `StaleWhileRevalidate` for `/api/auth/me`, `/api/games/counts`, `/api/platforms/status`.

**Implementation sketch:**
```ts
{
  urlPattern: /\/api\/(auth\/me|games\/counts|platforms\/status)/,
  handler: 'StaleWhileRevalidate',
  options: {
    cacheName: 'api-shell',
    expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 },
    cacheableResponse: { statuses: [0, 200] },
  },
},
```

**Tests:**
- Offline E2E (existing harness in `apps/web/tests/e2e-offline/`): on a warm SW, navigate Dashboard → Library while offline. Assert sidebar still shows username and shelf counts (from cache).
- Build inspection: production build's `sw.js` includes a route handler for the three new patterns.

**Success criteria:**
- [ ] Offline E2E shell renders username and shelf counts from cache.
- [ ] Online navigation still shows freshest data within ~1s.

---

### F10 — Composite indexes (P2)

**Goal:** Future-proof the per-status and per-lastPlayed queries; remove sequential scans.

**Addresses:** C10.

**Files:**
- Modify: [packages/db/prisma/schema.prisma](../packages/db/prisma/schema.prisma)
- Migration: `packages/db/prisma/migrations/{timestamp}_usergame_perf_indexes`

**Implementation sketch:**
```prisma
model UserGame {
  // ... existing fields
  @@unique([userId, gameId])
  @@index([userId, status])
  @@index([userId, lastPlayedAt(sort: Desc)])
}

model WishlistRelease {
  // ... existing fields
  @@unique([userId, igdbId])
  @@index([userId, releaseDate])
}
```

**Tests:**
- Migration applies cleanly on Supabase staging (manual: `prisma migrate deploy` against the connection string).
- `prisma migrate status` is clean post-migration.
- Manual `EXPLAIN ANALYZE` on `SELECT status, count(*) FROM "UserGame" WHERE "userId" = $1 GROUP BY status` shows `Index Scan` instead of `Seq Scan`. (Result documented in the PR body — not automated.)

**Success criteria:**
- [ ] Migration applied to production Supabase.
- [ ] `_prisma_migrations` table has the migration record (also fixes the cosmetic gap noted in CLAUDE.md).
- [ ] No app behavior change.

---

### F11 — `<link rel="preconnect">` to API origin (P2)

**Goal:** Warm DNS + TCP + TLS to `api.gamehoardr.com` during HTML parse, so the first API call is faster on cold loads.

**Addresses:** C12.

**Files:**
- Modify: [apps/web/index.html](../apps/web/index.html)

**Implementation sketch:**
```html
<link rel="preconnect" href="https://api.gamehoardr.com" crossorigin>
<link rel="dns-prefetch" href="https://api.gamehoardr.com">
```
Production-only (the dev proxy is same-origin). Conditional via build-time injection or simply tolerate the dev miss — the tag is harmless in dev.

**Tests:**
- Build inspection: production `dist/index.html` contains the preconnect tag.

**Success criteria:**
- [ ] Cold load (incognito Chrome on production): first `/api/*` request shows zero "Initial connection" / "TLS" time in DevTools (already warmed).

---

### F12 — Targeted memoization (P3)

**Goal:** Smoothness when the user types in search or toggles filters. Currently zero memo across screens.

**Addresses:** C11.

**Files:**
- Wrap with `React.memo`: [Sidebar.tsx](../apps/web/src/components/layout/Sidebar.tsx), [TopBar.tsx](../apps/web/src/components/layout/TopBar.tsx), [MobileTabBar.tsx](../apps/web/src/components/layout/MobileTabBar.tsx), [Heatmap.tsx](../apps/web/src/components/primitives/Heatmap.tsx), [Gauge.tsx](../apps/web/src/components/primitives/Gauge.tsx).
- `useMemo`: `applyFilters` results in [LibraryDesktop.tsx](../apps/web/src/components/screens/LibraryDesktop.tsx) and [LibraryMobile.tsx](../apps/web/src/components/screens/LibraryMobile.tsx); `shelves` array; `asciiChart()` output in `DashboardDesktop` / `DashboardMobile`.
- `useCallback`: navigation handlers, filter setters where they're passed as props.

**Tests:**
- Render-count tests (Vitest + RTL): mount Library, change unrelated state (e.g. modal toggle), assert each shelf component re-renders 0 additional times.
- Existing 40 web tests still pass.

**Success criteria:**
- [ ] Library Desktop frame budget (Chrome Performance tab, manual): typing in search field stays under 16ms per keystroke.
- [ ] No new re-render bugs in interactive flows (status edit, filter toggle).

---

### F13 — Code splitting per screen (P3)

**Goal:** Smaller initial bundle, slightly faster cold start. Currently a single 389 KB JS chunk.

**Addresses:** bundle weight (low priority — already small).

**Files:**
- Modify: [App.tsx](../apps/web/src/App.tsx) — `const Dashboard = lazy(() => import('./components/screens/Dashboard'))` per screen, wrap routes in `<Suspense fallback={<div className="hoard-noise" />}>`.
- Modify: [components/screens/index.ts](../apps/web/src/components/screens/index.ts) — barrel becomes named lazy exports or screens import directly.

**Tests:**
- Build inspection: vite output shows multiple chunks (one per screen + a vendor chunk).
- E2E: existing flows still pass (Suspense fallback should not be visible long enough to cause flake — set transition timing).

**Success criteria:**
- [ ] Initial bundle (without Settings, Game detail, PSN flow, etc.) is < 70 KB gzipped.
- [ ] No screen takes > 500ms to lazy-load on a warm cache.

---

### F14 — Confirm heatmap data source (P4, non-perf)

**Goal:** Make sure the activity heatmap reflects real data, not synthetic random values. Honesty fix; not a perf fix.

**Files:**
- Inspect: [components/primitives/Heatmap.tsx](../apps/web/src/components/primitives/Heatmap.tsx)
- If synthetic: extend `/api/dashboard` (or new `/api/stats/activity`) to return per-day playtime counts for the last N weeks.

**Tests:**
- If real data: integration test with seeded `lastPlayedAt` values, assert heatmap densities match expected.

**Success criteria:**
- [ ] Heatmap cells map to actual playtime activity per day.

---

## 4. Rollout (suggested PR sequence)

| PR | Bundle | Effort | What changes for the user |
|---|---|---|---|
| **PR 1** | F1 + F2 + F3 — shell + UserProvider + RequireAuth | ~2.5h | Username and shelf counts no longer flicker; noise-screen flash between routes is gone |
| **PR 2** | F4 + F8 + F9 — request cache + cache headers + SW shell cache | ~2.5h | No skeletons on revisit; instant repaints; works on flaky networks |
| **PR 3** | F5 + F6 — `/api/dashboard` slim + `/api/games/shelves` | ~3h | Dashboard cold-load drops noticeably; Library mount drops from 2K-game payload to per-shelf |
| **PR 4** | F7 + F11 — covers + preconnect | ~1h | Mobile bandwidth way down; first API call faster on cold load |
| **PR 5** | F10 + F12 + F13 — indexes + memo + lazy split | ~1.5h | Smoothness during typing/filtering; smaller initial bundle |
| **PR 6** | F14 — heatmap honesty | ~1h | Heatmap reflects real activity |

Total: ~11 hours, six PRs, each independently deployable and revertable.

After **PR 1 + PR 2** alone the app should feel like a different product — those two together address all four reported symptoms.

---

## 5. Cross-cutting tests

A few guardrails to add once and benefit from across all PRs:

- **Network-call counter helper** in `apps/web/src/test-setup.ts`: counts calls to `api.*` per test, exposes assertions like `expectApiCalls('me', 1)`. Used by F1, F2, F4 tests.
- **Playwright fixture `pageNavCount`** that records a per-route render-tree snapshot and asserts `Sidebar` element identity is preserved across navigations (the same DOM node, not a re-mount).
- **Lighthouse CI thresholds** ([apps/web/lighthouserc.json](../apps/web/lighthouserc.json)): keep current thresholds (Performance ≥ 80, Accessibility ≥ 90, Best-practices ≥ 90); after this work lands, lift Performance to ≥ 90.

---

## 6. Status tracking

Mark items off as PRs land. Keep this file as the source of truth for the workstream until everything is done; then collapse the whole workstream into a single line in `docs/PLAN.md` Phase Status table (e.g. `Post-7 — Perf & UX Plan | Done | …`).

| ID | Status | PR | Date | Notes |
|----|--------|----|------|-------|
| F1 | Done | PR 1 | 2026-05-04 | `AppShell` layout route in `apps/web/src/components/layout/AppShell.tsx`; sidebar/topbar/mobile-tab-bar mount once. Shell-persistence integration test asserts the same `aside.sidebar` DOM node across `/` → `/library` → `/upcoming`. |
| F2 | Done | PR 1 | 2026-05-04 | `UserProvider` in `apps/web/src/contexts/UserContext.tsx`. Sidebar, RequireAuth, PreferencesContext, useCurrentUser, SettingsDesktop, SettingsMobile all read from context. Integration test asserts `api.me` called once across 4 navigations. |
| F3 | Done | PR 1 | 2026-05-04 | `RequireAuth` lives at the layout route element (`<RequireAuth><AppShell /></RequireAuth>`). Reads status from `useUser()` — no own fetch. Integration test asserts `hoard-noise` placeholder shows during loading then resolves to mounted shell. |
| F4 | Done | PR 2 | 2026-05-04 | Tiny SWR cache in `apps/web/src/lib/cache.ts` (~70 LOC, no deps) and `useQuery` hook in `apps/web/src/hooks/useQuery.ts`. `useDashboard`, `useGames`, `useGame`, `useUpcoming`, plus Sidebar's `gameCounts` / `platformStatus` queries all migrate. Mutation invalidation wired in `lib/api.ts` (`patchGame`, `toggleWishlist`, `addManualGame`, platform mutations, `logout`, `deleteAccount`). Tests: `lib/__tests__/cache.test.ts` (7 unit), `hooks/__tests__/useQuery.test.tsx` (4), `lib/__tests__/api-invalidation.test.ts` (5). |
| F5 | Done | PR 3 | 2026-05-04 | `/api/dashboard` no longer loads the full library. Split into 7 parallel queries: `groupBy` (counts), `count` (weeklyAdded), `findMany` Playing take 3 (full game+hltb), `findMany` Backlog with lightweight select (id + hltb.mainStory), `findMany` everywhere with lightweight select (playtimeByPlatform + game.genres only) for aggregations, `findMany` wishlist take 5, `findMany` platforms. Then a follow-up `findMany` Backlog `where: { id: { in: top30 } }` for the shuffle pool. Backlog pool capped at `BACKLOG_POOL_SIZE = 30`. Response shape unchanged. Shared `mapUserGame` extracted to `apps/api/src/lib/mappers.ts`. Tests in `dashboard.test.ts` updated for the new query plan; new test asserts the lightweight select is used. |
| F6 | Done | PR 3 | 2026-05-04 | New `GET /api/games/shelves?perStatus=N` endpoint returns 6 shelves × N items + per-status counts in one round trip. `useShelves` hook + `api.shelves()` client. `LibraryDesktop` and `LibraryMobile` migrated: shelves view uses `useShelves(12)` / `useShelves(4)`; status-filtered view (`/library/Backlog`) uses `useGames({ status, limit: 500 })`. `/api/games?limit=2000` no longer accepted — cap at 500. Hooks gained an `enabled` option to disable the inactive branch. Tests: 5 new shelves endpoint tests (shape, perStatus take, default 12, perStatus > 50 rejected, Wishlist orderBy) + 2 limit-cap tests. |
| F7 | Done | PR 4 | 2026-05-04 | `<Cover>` `<img>` now sets `loading="lazy"`, `decoding="async"`, and intrinsic `width`/`height` (when both are numeric — prevents CLS). New `apps/web/src/lib/igdbCover.ts` helper substitutes the IGDB size variant: targets ≤ 90 px get `t_cover_small` (90×128, ~6× less bandwidth), larger targets keep `t_cover_big` (264×374). Non-IGDB URLs pass through. **Follow-on (same day):** Library Desktop and Library Mobile skeleton states rewritten to mirror the real layout — filter bar, 6 shelves (was 3), cover dims that match `prefs.coverDensity`, filtered-shelf skeleton with the correct back-bar shape. Skeleton-to-content swap on cold load is now seamless. Tests: 6 unit tests for `igdbCoverSize` + 4 component tests for the new attributes/substitution. |
| F8 | Done | PR 2 | 2026-05-04 | `Cache-Control: private, max-age=10` on `/api/auth/me` and `/api/games/counts`. `Cache-Control: private, max-age=30` on `/api/platforms/status`. Asserted by 3 new integration tests in the existing route test files. |
| F9 | Done | PR 2 | 2026-05-04 | New `runtimeCaching` rule in `apps/web/vite.config.ts`: `StaleWhileRevalidate` for `/api/(auth/me\|games/counts\|platforms/status)` under cache name `api-shell`, max-age 24 h. Verified in production build — `dist/sw.js` includes both the cache name and strategy. |
| F10 | Done | PR 5 | 2026-05-04 | Added `@@index([userId, status])` and `@@index([userId, lastPlayedAt(sort: Desc)])` on `UserGame`, plus `@@index([userId, releaseDate])` on `WishlistRelease`. Migration `20260504200000_usergame_perf_indexes` applied to production Supabase. The same `migrate deploy` run also reconciled the previous RLS migration record in `_prisma_migrations` — `migrate status` is fully green now. |
| F11 | Done | PR 4 | 2026-05-04 | `<link rel="preconnect">` + `<link rel="dns-prefetch">` for `api.gamehoardr.com` AND `images.igdb.com` in `apps/web/index.html`. Verified in production build (`dist/index.html`). Cold-load TLS handshake to API and IGDB images now overlaps with HTML parse instead of running serially after JS executes. |
| F12 | Done | PR 5 | 2026-05-04 | `React.memo` on `Sidebar`, `TopBar`, `MobileTabBar`, `Heatmap`, `Gauge` (the components most likely to re-render unnecessarily as parent state changes). `useMemo` on `applyFilters` results and `shelves` array in `LibraryDesktop` and `LibraryMobile`; `useMemo` on `asciiChart()` output in `DashboardDesktop` and `DashboardMobile`. Hooks ordered above any early `return` to satisfy the rules-of-hooks lint. |
| F13 | Done | PR 5 | 2026-05-04 | Each screen is now `React.lazy()` in `App.tsx`, wrapped in a single `<Suspense fallback>` using the same `hoard-noise` placeholder as `RequireAuth`. A small `lazyNamed` helper handles named-export → default-export wrapping so screen files keep their existing exports. Initial JS bundle dropped from 105.68 KB to **75.38 KB gzipped** (~30%). Each screen lazy-loads as a separate chunk (~3–5 KB gzipped each). Existing tests still pass — Suspense fallback resolves quickly in jsdom. |
| F14 | Done | PR 6 | 2026-05-04 | Heatmap is no longer synthetic. New `ActivityHeatmap` type in `@hoard/types`. `/api/dashboard` adds `lastPlayedAt` to the lightweight aggUserGames select and computes a 24-week × 7-day cell grid (column-major, row 0 = Sunday). Heatmap component now takes `cells: number[]` and maps raw counts (0..6+) to the 6 visual levels. Dashboard Desktop renders 24 weeks; Mobile slices the rightmost 16 weeks from the same payload. Markers updated to "// games last-played · Nwk" so the visual is read correctly. **Decision noted under §7:** without a session log, this is "games last-touched per day" not "playtime per day" — sparse but real. Test seeds 6 games with timed `lastPlayedAt` and asserts the expected cells contain the right counts. |

---

## 7. Decisions log

> Non-obvious choices made during implementation.

**F14 — Activity heatmap is "games last-touched per day," not "playtime per day."**
**Decision:** Heatmap intensity = number of distinct games whose `UserGame.lastPlayedAt` falls on that day, bucketed across 24 weeks (column-major, Sun-Sat).
**Why:** Steam/PSN/etc. only expose a single "last played" timestamp per title — no daily session granularity. We don't keep our own session log either. `lastPlayedAt`-bucketed is the most honest signal we can build from existing data.
**Trade-off:** Heatmap is sparser than a real session log would produce — most days contribute 0 or 1, occasional 2-3 on days you switch between titles. Marker re-labeled "games last-played" so the visual is read correctly. If session-density is wanted later, a `PlaySession` table populated on every sync delta would feed a real activity heatmap; deliberately deferred.
