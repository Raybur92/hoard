import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { TopBar } from '../layout/TopBar';
import { Cover } from '../primitives/Cover';
import { Plat } from '../primitives/Plat';
import { Chip } from '../primitives/Chip';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { Marker } from '../primitives/Marker';
import { useGames } from '../../hooks/useGames';
import { useShelves } from '../../hooks/useShelves';
import { useLensIndex } from '../../hooks/useLensIndex';
import { useLensRoute, type LensType } from '../../hooks/useLensRoute';
import { usePreferences } from '../../contexts/PreferencesContext';
import { minutesToHours, formatRelative, shortYear } from '../../lib/utils';
import { pickTopTagCounts, filterByTag, type TagDimension } from '../../lib/pickTopTags';
import { slugifyTag, findTagBySlug } from '../../lib/tagSlug';
import { FilterPopover } from '../library/FilterPopover';
import { ChangeLensPopover } from '../library/ChangeLensPopover';
import { AddGameModal } from './AddGameModal';
import type { UserGameDetail, GameStatus } from '@hoard/types';

interface GameDisplay {
  id: string;
  title: string;
  developer: string;
  year: number | null;
  platformCode: string;
  playtime: string;
  lastPlayed: string;
  progress: number;
  hltbHours?: number;
  coverUrl: string | null;
}

interface ShelfDisplay {
  name: string;
  status: GameStatus;
  tone: 'green' | 'amber' | 'red' | null;
  count: number;
  items: GameDisplay[];
}

const SHELF_CONFIG: Array<{ name: string; status: GameStatus; tone: 'green' | 'amber' | 'red' | null }> = [
  { name: 'Now Playing', status: 'Playing',   tone: 'green' },
  { name: 'On Hold',     status: 'On Hold',   tone: null },
  { name: 'Completed',   status: 'Completed', tone: null },
  { name: 'Backlog',     status: 'Backlog',   tone: null },
  { name: 'Dropped',     status: 'Dropped',   tone: 'red' },
  { name: 'Wishlist',    status: 'Wishlist',  tone: 'amber' },
];

function toGameDisplay(ug: UserGameDetail): GameDisplay {
  const totalMin = Object.values(ug.playtimeByPlatform).reduce<number>((s, m) => s + (m ?? 0), 0);
  const hltbMin = ug.hltb?.mainStory ?? 0;
  const entries = Object.entries(ug.playtimeByPlatform).sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));
  const platformCode = entries[0]?.[0] ?? 'ST';
  const progress = ug.status === 'Completed'
    ? 100
    : hltbMin > 0 ? Math.min(99, Math.round((totalMin / hltbMin) * 100)) : 0;
  return {
    id: ug.id,
    title: ug.game.title,
    developer: ug.game.developer ?? '',
    year: ug.game.releaseYear,
    platformCode,
    playtime: minutesToHours(totalMin),
    lastPlayed: formatRelative(ug.lastPlayedAt),
    progress,
    coverUrl: ug.game.coverUrl,
    ...(ug.hltb?.mainStory ? { hltbHours: Math.round(ug.hltb.mainStory / 60) } : {}),
  };
}

const COVER_DIMS: Record<string, { w: number; h: number }> = {
  cozy:     { w: 150, h: 200 },
  standard: { w: 130, h: 174 },
  dense:    { w: 108, h: 144 },
};

interface ShelfItemProps {
  g: GameDisplay;
  w?: number;
  h?: number;
  isBacklog: boolean;
  showHltb: boolean;
}

// PERF-2 — memoized so chip-click / sort changes don't re-render every
// card. Most filter operations change the FILTERED SET (which subset is
// visible) without mutating any individual card's props, so memo prevents
// ~500 re-renders per chip click on Andrea's library. The shallow-compare
// cost is negligible vs. the saved render work.
const ShelfItem = memo(function ShelfItem({ g, w = 130, h = 174, isBacklog, showHltb }: ShelfItemProps) {
  const navigate = useNavigate();
  const tone = g.progress === 100 ? 'var(--paper)' : g.progress > 0 ? 'var(--green)' : 'var(--paper-faint)';
  return (
    <button
      type="button"
      onClick={() => navigate(`/game/${g.id}`)}
      aria-label={`Open ${g.title}`}
      style={{ width: w, flex: '0 0 auto', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0, font: 'inherit', color: 'inherit', textAlign: 'left' }}
    >
      <div style={{ position: 'relative' }}>
        <Cover w={w} h={h} src={g.coverUrl} label={g.title.toUpperCase()} dev={g.developer} year={shortYear(g.year)} bright={g.progress > 0} />
        <div style={{ position: 'absolute', top: 6, right: 6 }}>
          <Plat code={g.platformCode} />
        </div>
        {isBacklog && showHltb && g.hltbHours != null && (
          <div style={{ position: 'absolute', bottom: 4, left: 4, padding: '2px 5px', background: 'rgba(0,0,0,0.78)', border: '1px solid var(--rule-bright)', fontFamily: 'var(--mono)', fontSize: "var(--text-2xs)", letterSpacing: '0.04em', color: 'var(--paper-dim)' }}>
            <span style={{ color: 'var(--paper-dim)', fontSize: "var(--text-3xs)" }}>HLTB </span>~{g.hltbHours}h
          </div>
        )}
        {g.progress > 0 && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'rgba(0,0,0,0.4)' }}>
            <div style={{ height: '100%', width: `${g.progress}%`, background: tone }} />
          </div>
        )}
      </div>
      <div style={{ marginTop: 8, fontSize: "var(--text-2xs)", color: 'var(--paper)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.title}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: "var(--text-2xs)", color: 'var(--paper-dim)' }}>
        <span className="t-tnum">{g.playtime}</span>
        <span className="t-tnum">{g.lastPlayed}</span>
      </div>
    </button>
  );
});

interface ShelfProps {
  idx: number;
  shelf: ShelfDisplay;
  coverW: number;
  coverH: number;
  showHltb: boolean;
}

const SHELF_GAP = 16;

function Shelf({ idx, shelf, coverW, coverH, showHltb }: ShelfProps) {
  const navigate = useNavigate();
  const rowRef = useRef<HTMLDivElement>(null);
  const [visibleSlots, setVisibleSlots] = useState(8);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const compute = (width: number) => {
      const slots = Math.max(2, Math.floor((width + SHELF_GAP) / (coverW + SHELF_GAP)));
      setVisibleSlots(slots);
    };
    compute(el.clientWidth);
    const ro = new ResizeObserver((entries) => { if (entries[0]) compute(entries[0].contentRect.width); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [coverW]);

  const isBacklog = shelf.status === 'Backlog';
  const accent = shelf.tone === 'green' ? 'var(--green)' : shelf.tone === 'amber' ? 'var(--amber)' : shelf.tone === 'red' ? 'var(--red)' : 'var(--paper)';
  // Reserve last slot for "view all", show the rest with game covers
  const shown = shelf.items.slice(0, visibleSlots - 1);
  const remaining = shelf.count - shown.length;
  return (
    <div id={`shelf-${shelf.status}`} style={{ padding: '24px 0' }}>
      <div className="shelf-label">
        <span className="num" style={{ color: accent }}>{String(idx).padStart(2, '0')}</span>
        <span className="name">{shelf.name}</span>
        <span className="t-mono t-faint" style={{ fontSize: "var(--text-2xs)" }}>· {shelf.count} titles</span>
      </div>
      <div ref={rowRef} style={{ display: 'flex', gap: SHELF_GAP, overflow: 'hidden' }}>
        {shown.map(g => <ShelfItem key={g.id} g={g} w={coverW} h={coverH} isBacklog={isBacklog} showHltb={showHltb} />)}
        <button
          type="button"
          onClick={() => navigate(`/library/${encodeURIComponent(shelf.status)}`)}
          aria-label={`View all ${shelf.status} games`}
          style={{ width: coverW, flex: `0 0 ${coverW}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--rule-bright)', height: coverH, color: 'var(--paper-dim)', fontSize: "var(--text-2xs)", gap: 6, cursor: 'pointer', background: 'transparent', fontFamily: 'inherit' }}
        >
          {remaining > 0 && <span style={{ fontSize: "var(--text-lg)" }}>+{remaining}</span>}
          <span className="t-up" style={{ fontSize: "var(--text-2xs)" }}>view all</span>
        </button>
      </div>
      <div style={{ height: 4, background: 'var(--rule-bright)', marginTop: 10, position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 4, height: 1, background: 'var(--rule)' }} />
      </div>
    </div>
  );
}

type SortBy = 'lastPlayed' | 'title' | 'playtime';

const SORT_LABELS: Record<SortBy, string> = { lastPlayed: 'last played', title: 'title', playtime: 'playtime' };
const SORT_CYCLE: SortBy[] = ['lastPlayed', 'title', 'playtime'];

export function LibraryDesktop() {
  const navigate = useNavigate();
  // B-IGDB-3b2 — lens-aware routing. `lens.type` is one of:
  //   null         → overview (`/library`)
  //   'status'     → `/library/:status` (existing)
  //   'genre'|'theme'|'perspective' → `/library/by-X/:slug` (NEW)
  // `statusParam` derived for back-compat with existing status-lens code.
  const lens = useLensRoute();
  const statusParam = lens.type === 'status' ? lens.slug : undefined;
  const isFiltered = lens.type !== null;
  // Resolve tag slug → canonical name via lens-index. `null` when:
  //  - not on a tag lens, OR
  //  - lens-index hasn't loaded yet (loading state below catches it),
  //  - the slug doesn't match any known tag (we render a 404-style view).
  const { data: lensIndex, loading: lensIndexLoading } = useLensIndex();
  const lensCanonical: string | null = (() => {
    if (!lens.slug) return null;
    if (lens.type === 'status') return lens.slug;
    if (!lensIndex) return null;
    const dim = lens.type === 'genre' ? lensIndex.genre
              : lens.type === 'theme' ? lensIndex.theme
              : lens.type === 'perspective' ? lensIndex.perspective
              : null;
    return dim ? findTagBySlug(dim.map((e) => e.name), lens.slug) : null;
  })();
  useDocumentTitle(
    lens.type === null
      ? 'Library'
      : `Library · ${lens.type === 'status' ? statusParam : (lensCanonical ?? lens.slug)}`,
  );

  // Library-only search input — A1. The user wanted "two searches": Cmd-K
  // global (IGDB-wide, finds games not yet owned) and Library `/` (only games
  // the user owns). The shelves view turns into a flat search-results grid
  // while the input has any value.
  const [searchInput, setSearchInput] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const trimmedQuery = searchInput.trim();
  const isSearching = !isFiltered && trimmedQuery.length > 0;

  // Shelves view: top N per status + counts in one round trip.
  const { data: shelvesData, loading: shelvesLoading, error: shelvesError, refetch: refetchShelves } =
    useShelves(12, { enabled: !isFiltered && !isSearching });

  // Filtered single-shelf view: load the entire shelf so the chip-strip
  // count matches the sidebar's truthful per-status count. Server cap is
  // 50000 (effectively unbounded for any realistic personal library); we
  // request that ceiling so the load is bounded only by the actual shelf
  // size, not by an arbitrary pagination cap. The displayed "X titles"
  // count comes from `filteredData.total` (server's pre-pagination count)
  // when no secondary filters are active, falling back to `items.length`
  // when filters narrow the visible set.
  // B-IGDB-3b2 — params depend on the active primary lens. Tag lenses
  // (genre/theme/perspective) gate enablement on lensCanonical so the
  // request fires only after the slug has resolved.
  const filteredParams = (() => {
    if (lens.type === 'status' && statusParam)
      return { status: statusParam as GameStatus, limit: 50000 };
    if (lens.type === 'genre' && lensCanonical)
      return { genre: lensCanonical, limit: 50000 };
    if (lens.type === 'theme' && lensCanonical)
      return { theme: lensCanonical, limit: 50000 };
    if (lens.type === 'perspective' && lensCanonical)
      return { perspective: lensCanonical, limit: 50000 };
    return undefined;
  })();
  const filteredEnabled = filteredParams !== undefined;
  const { data: filteredData, loading: filteredLoading, error: filteredError, refetch: refetchFiltered } =
    useGames(filteredParams, { enabled: filteredEnabled });

  // Search results: hits the existing /api/games?q= endpoint (already supports
  // case-insensitive title match scoped to the user's library).
  const { data: searchData, loading: searchLoading, error: searchError } =
    useGames(
      isSearching ? { q: trimmedQuery, limit: 100 } : undefined,
      { enabled: isSearching },
    );

  const loading = isFiltered ? filteredLoading : isSearching ? searchLoading : shelvesLoading;
  const error = isFiltered ? filteredError : isSearching ? searchError : shelvesError;
  const refetch = isFiltered ? refetchFiltered : refetchShelves;

  // `/` global shortcut — only when on /library*, and only when the active
  // element isn't already an editable field (so typing "/" inside another
  // input doesn't hijack focus).
  useEffect(() => {
    function isEditable(el: Element | null): boolean {
      if (!el) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      return (el as HTMLElement).isContentEditable;
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditable(document.activeElement)) return;
      e.preventDefault();
      searchInputRef.current?.focus();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { prefs } = usePreferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showAddModal, setShowAddModal] = useState(false);
  const [platFilter, setPlatFilter] = useState<string>('all');

  // B-IGDB-3b1 — IGDB-tag triple secondary filters live in URL params per
  // PAGES_PLAN §4.4.1. `null` = no filter applied. Reset alongside platFilter
  // when the lens slug changes (same React Router 6 reuse-across-route-params
  // problem — the component doesn't unmount, so filters stick).
  const genreFilter = searchParams.get('genre');
  const themeFilter = searchParams.get('theme');
  const perspectiveFilter = searchParams.get('perspective');
  const setTagFilter = (dimension: 'genre' | 'theme' | 'perspective', value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value === null) next.delete(dimension); else next.set(dimension, value);
    setSearchParams(next, { replace: true });
  };
  // B-IGDB-3b2 — find input scoped to the active lens. URL-state-resident
  // as `?q=` per PAGES_PLAN §4.4.1; composes with all other filters.
  const findQuery = searchParams.get('q') ?? '';
  const setFindQuery = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value.trim().length === 0) next.delete('q'); else next.set('q', value);
    setSearchParams(next, { replace: true });
  };

  // Reset the LOCAL platform filter state when the lens changes. The
  // component instance is reused across /library, /library/:status,
  // and /library/by-X/:slug (React Router 6 doesn't unmount on param
  // changes), so `useState`-backed state needs explicit reset.
  //
  // URL-resident filters (genre/theme/perspective/q) are NOT cleared
  // here — they're already accurate to the new URL by virtue of being
  // URL state, and the change-lens pivot intentionally carries
  // secondary filters across (e.g. /library/by-genre/action?theme=Horror
  // → /library/by-theme/horror?genre=Action). A blanket clear here
  // would defeat that pivot.
  useEffect(() => {
    setPlatFilter('all');
  }, [lens.slug, lens.type]);
  // Sort persists in URL so filtered single-shelf views (`/library/Backlog?sort=playtime`)
  // are shareable. Only consumed on the filtered view — shelves view dropped
  // the sort control in PR A (D4): it operated on top-12 per shelf only.
  const sortBy: SortBy = (() => {
    const v = searchParams.get('sort');
    return v === 'title' || v === 'playtime' || v === 'lastPlayed' ? v : 'lastPlayed';
  })();
  const setSortBy = (s: SortBy) => {
    const next = new URLSearchParams(searchParams);
    if (s === 'lastPlayed') next.delete('sort'); else next.set('sort', s);
    setSearchParams(next, { replace: true });
  };
  const coverDims = COVER_DIMS[prefs.coverDensity] ?? COVER_DIMS['standard']!;

  const applyFilters = useCallback((games: UserGameDetail[]): UserGameDetail[] => {
    let result = platFilter === 'all' ? games : games.filter(ug => Object.keys(ug.playtimeByPlatform).includes(platFilter));
    // B-IGDB-3b1 — IGDB-tag triple secondary filters compose (intersection)
    // with the platform filter + each other. URL-state-resident.
    result = filterByTag(result, 'genre', genreFilter);
    result = filterByTag(result, 'theme', themeFilter);
    result = filterByTag(result, 'perspective', perspectiveFilter);
    if (sortBy === 'title') return [...result].sort((a, b) => a.game.title.localeCompare(b.game.title));
    if (sortBy === 'playtime') return [...result].sort((a, b) => {
      const total = (ug: UserGameDetail) => Object.values(ug.playtimeByPlatform).reduce<number>((s, m) => s + (m ?? 0), 0);
      return total(b) - total(a);
    });
    return [...result].sort((a, b) => (b.lastPlayedAt ? new Date(b.lastPlayedAt).getTime() : 0) - (a.lastPlayedAt ? new Date(a.lastPlayedAt).getTime() : 0));
  }, [platFilter, sortBy, genreFilter, themeFilter, perspectiveFilter]);

  const shelfCounts: Partial<Record<GameStatus, number>> = shelvesData?.counts ?? {};
  const totalGames = (Object.values(shelfCounts) as number[]).reduce((s, n) => s + n, 0);

  const shelves: ShelfDisplay[] = useMemo(() =>
    SHELF_CONFIG.map(cfg => {
      const items = applyFilters(shelvesData?.shelves[cfg.status] ?? []);
      return { ...cfg, count: shelfCounts[cfg.status] ?? items.length, items: items.map(toGameDisplay) };
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [shelvesData, applyFilters, JSON.stringify(shelfCounts)]);

  // Modal element extracted to a stable position. Prepended to every
  // return fragment so React reconciles it at index 0 across all branches
  // (error / loading / single-shelf / shelves). Without this, the brief
  // `loading` flicker that follows refetch (cache.invalidate clears the
  // shelves cache entry → useQuery flips loading=true → component hits
  // the skeleton early-return) unmounts the modal and remounts it on the
  // next render, resetting all state (P5 success → P1 empty + focused
  // search input). Andrea reported this 2026-05-22; the structural fix
  // is to keep the modal outside the data-loading-conditional branches.
  const modalElement = showAddModal && (
    <AddGameModal onClose={() => setShowAddModal(false)} onAdded={() => { void refetch(); }} />
  );

  if (error) {
    return (
      <>
        {modalElement}
        <TopBar crumbs={['hoard', 'library']} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '32px' }}>
          <span className="t-mono t-red" style={{ fontSize: "var(--text-xs)" }}>{`// failed to load library`}</span>
          <span className="t-mono t-faint" style={{ fontSize: "var(--text-2xs)", maxWidth: 480, textAlign: 'center' }}>{error}</span>
          <Btn sm onClick={() => refetch()}>retry</Btn>
        </div>
      </>
    );
  }

  if (loading || lensIndexLoading || (!isFiltered && !shelvesData) || (isFiltered && filteredEnabled && !filteredData)) {
    // Skeleton mirrors the real layout (filter bar + grid) so the swap
    // to loaded content doesn't jolt. Same skeleton for all 4 lens types.
    if (isFiltered) {
      const cfg = lens.type === 'status'
        ? SHELF_CONFIG.find(c => c.status === statusParam)
        : null;
      const skelTitle = lens.type === 'status'
        ? (cfg?.name ?? statusParam ?? '').toLowerCase()
        : `${lens.type ?? ''} · ${lens.slug ?? ''}`;
      return (
        <>
          {modalElement}
          <TopBar crumbs={['hoard', 'library', skelTitle]} />
          <div style={{ padding: '16px 32px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="skel" style={{ width: 88, height: 24 }} />
            <div style={{ width: 1, height: 20, background: 'var(--rule)' }} />
            <div className="skel" style={{ width: 80, height: 12 }} />
            <div className="skel" style={{ width: 60, height: 11 }} />
            <div style={{ width: 1, height: 20, background: 'var(--rule)' }} />
            <div className="skel" style={{ width: 28, height: 11 }} />
            <div className="skel" style={{ width: 38, height: 22 }} />
            <div className="skel" style={{ width: 32, height: 22 }} />
            <div className="skel" style={{ width: 32, height: 22 }} />
            <div className="skel" style={{ width: 32, height: 22 }} />
            <div className="skel" style={{ width: 32, height: 22 }} />
            <span style={{ flex: 1 }} />
            <div className="skel" style={{ width: 110, height: 14 }} />
            <div className="skel" style={{ width: 96, height: 24 }} />
          </div>
          <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '24px 32px 40px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {Array.from({ length: 18 }).map((_, j) => (
                <div key={j} className="skel" style={{ width: coverDims.w, height: coverDims.h, flex: '0 0 auto' }} />
              ))}
            </div>
          </div>
        </>
      );
    }
    return (
      <>
        {modalElement}
        <TopBar crumbs={['hoard', 'library']} />
        <div style={{ padding: '20px 32px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div className="skel" style={{ width: 320, height: 28 }} />
          <span style={{ flex: 1 }} />
          <div className="skel" style={{ width: 96, height: 24 }} />
        </div>
        <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '0 32px 40px' }}>
          {SHELF_CONFIG.map((cfg) => (
            <div key={cfg.status} style={{ padding: '24px 0' }}>
              <div className="shelf-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="skel" style={{ width: 22, height: 14 }} />
                <div className="skel" style={{ width: 100, height: 12 }} />
                <div className="skel" style={{ width: 60, height: 10 }} />
              </div>
              <div style={{ display: 'flex', gap: SHELF_GAP, marginTop: 10, overflow: 'hidden' }}>
                {Array.from({ length: 8 }).map((_, j) => (
                  <div key={j} className="skel" style={{ width: coverDims.w, height: coverDims.h, flex: '0 0 auto' }} />
                ))}
              </div>
              <div style={{ height: 4, background: 'var(--rule-bright)', marginTop: 10, position: 'relative' }}>
                <div style={{ position: 'absolute', left: 0, right: 0, top: 4, height: 1, background: 'var(--rule)' }} />
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  // B-IGDB-3b2 — tag lens slug failed to resolve (unknown tag). Show a
  // friendly 404-style view instead of a blank shelf.
  if (lens.type && lens.type !== 'status' && !lensIndexLoading && lensCanonical === null) {
    return (
      <>
        {modalElement}
        <TopBar crumbs={['hoard', 'library', lens.type, lens.slug ?? '?']} />
        <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span className="t-mono t-faint" style={{ fontSize: 'var(--text-xs)' }}>// {lens.type} not found</span>
          <span className="t-mono" style={{ fontSize: 'var(--text-sm)' }}>
            no {lens.type} matches "{lens.slug}" in your library
          </span>
          <div>
            <Btn sm onClick={() => navigate('/library')}>
              <Icon name="back" size={10} /> back to library
            </Btn>
          </div>
        </div>
      </>
    );
  }

  if (filteredEnabled && lens.type) {
    // Derive view config from the active lens. Status uses SHELF_CONFIG;
    // tag lenses use the resolved canonical name as both display label
    // and value (no accent color — tag dimensions are not status-tinted).
    const lensTypeLabel: Record<LensType, string> = {
      status: 'status',
      genre: 'genre',
      theme: 'theme',
      perspective: 'perspective',
    };
    const cfg = lens.type === 'status'
      ? SHELF_CONFIG.find((c) => c.status === statusParam)
      : null;
    const displayName = lens.type === 'status'
      ? (cfg?.name ?? statusParam ?? '')
      : (lensCanonical ?? '');
    const filteredGames = filteredData?.games ?? [];
    // Find query filters titles client-side over the already-loaded set
    // (limit:50000 means we have the full intersection in memory).
    const findTrimmed = findQuery.trim().toLowerCase();
    const findFilteredGames = findTrimmed.length === 0
      ? filteredGames
      : filteredGames.filter((g) => g.game.title.toLowerCase().includes(findTrimmed));
    const items = applyFilters(findFilteredGames).map(toGameDisplay);
    const isBacklog = lens.type === 'status' && statusParam === 'Backlog';
    const accent = cfg?.tone === 'green' ? 'var(--green)' : cfg?.tone === 'amber' ? 'var(--amber)' : cfg?.tone === 'red' ? 'var(--red)' : 'var(--paper)';
    // Display count — when no secondary filter is active AND no find
    // query, mirror the sidebar's truthful pre-pagination count from
    // the server. Otherwise show the filtered count.
    const anyFilterActive = platFilter !== 'all'
      || genreFilter !== null
      || themeFilter !== null
      || perspectiveFilter !== null
      || findTrimmed.length > 0;
    const displayCount = anyFilterActive ? items.length : (filteredData?.total ?? items.length);
    // Secondary filter visibility per PAGES_PLAN §4.4.1: hide the popover
    // for the dimension that's PRIMARY (it's already constrained by URL).
    const secondaryDims: { id: TagDimension; label: string; active: string | null }[] = (
      [
        { id: 'genre',       label: 'genre', active: genreFilter,       hideOnLens: 'genre' },
        { id: 'theme',       label: 'theme', active: themeFilter,       hideOnLens: 'theme' },
        { id: 'perspective', label: 'persp', active: perspectiveFilter, hideOnLens: 'perspective' },
      ] as const
    ).filter((d) => d.hideOnLens !== lens.type)
     .map(({ id, label, active }) => ({ id, label, active }));
    // Change-lens handler — pivots primary lens, transferring lens
    // semantics to/from URL where possible.
    //   FROM status TO tag: enabled if `?<dim>=value` is set as secondary;
    //                       status preserved as `?status=<S>` query param.
    //   FROM tag TO another tag: enabled if `?<targetDim>=value` is set;
    //                       old primary preserved as `?<oldDim>=<canonical>`.
    //   FROM tag TO status: deferred until status-as-secondary on tag
    //                       lenses ships (v1 has no `?status=` chip yet).
    const changeLensOptions = ([
      { type: 'status' as LensType,      label: 'status' },
      { type: 'genre' as LensType,       label: 'genre' },
      { type: 'theme' as LensType,       label: 'theme' },
      { type: 'perspective' as LensType, label: 'perspective' },
    ]).map((o) => {
      if (o.type === lens.type) return { ...o, disabled: true };
      if (o.type === 'status') return { ...o, disabled: true }; // deferred
      // Pivot to a tag lens is enabled when its corresponding URL
      // filter is set as a secondary filter on the current lens.
      if (o.type === 'genre' && genreFilter) return { ...o, disabled: false };
      if (o.type === 'theme' && themeFilter) return { ...o, disabled: false };
      if (o.type === 'perspective' && perspectiveFilter) return { ...o, disabled: false };
      return { ...o, disabled: true };
    });
    const handleChangeLens = (target: LensType) => {
      if (target === 'status') return; // deferred
      let activeValue: string | null = null;
      if (target === 'genre') activeValue = genreFilter;
      else if (target === 'theme') activeValue = themeFilter;
      else if (target === 'perspective') activeValue = perspectiveFilter;
      if (!activeValue) return;
      // Build new query params:
      //   - drop the target dimension (it becomes the URL slug)
      //   - preserve other secondary filters as-is
      //   - preserve the OLD primary as a secondary filter on the new lens
      const newParams = new URLSearchParams(searchParams);
      newParams.delete(target);
      if (lens.type === 'status' && statusParam) {
        // status was URL-path primary → becomes ?status= secondary
        newParams.set('status', statusParam);
      } else if (lens.type && lens.type !== 'status' && lensCanonical) {
        // tag→tag: old primary's CANONICAL name becomes secondary on new lens
        newParams.set(lens.type, lensCanonical);
      }
      const qs = newParams.toString();
      navigate(`/library/by-${target}/${slugifyTag(activeValue)}${qs ? `?${qs}` : ''}`);
    };
    return (
      <>
        {modalElement}
        <TopBar crumbs={['hoard', 'library', lensTypeLabel[lens.type], displayName.toLowerCase()]} />
        <div style={{ padding: '16px 32px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Row 1: back · lens label · primary value · count · (spacer)
              · find · change-lens · sort · add. Primary action
              [+ add game] is always anchored top-right on its own row. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Btn sm onClick={() => navigate('/library')}>
              <Icon name="back" size={10} /> library
            </Btn>
            <div style={{ width: 1, height: 20, background: 'var(--rule)' }} />
            <span className="t-up t-faint" style={{ fontSize: 'var(--text-3xs)' }}>{lensTypeLabel[lens.type]}</span>
            <span className="t-up" style={{ fontSize: "var(--text-2xs)", color: accent }}>{displayName}</span>
            <span className="t-mono t-faint" style={{ fontSize: "var(--text-2xs)" }}>· {displayCount} titles</span>
            <span style={{ flex: 1 }} />
            {/* B-IGDB-3b2 — find input scoped to current lens intersection. */}
            <label htmlFor="library-find" className="field" style={{ width: 200, cursor: 'text' }} aria-label={`Find within ${displayName}`}>
              <span className="pre">$</span>
              <span style={{ color: 'var(--paper)' }}>find</span>
              <input
                id="library-find"
                type="text"
                value={findQuery}
                onChange={(e) => setFindQuery(e.target.value)}
                placeholder="title..."
                aria-label="Find within current lens"
                style={{
                  flex: 1, minWidth: 0,
                  background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--paper)', fontFamily: 'inherit', fontSize: 'inherit', letterSpacing: 'inherit',
                  padding: 0,
                }}
              />
              {findQuery && (
                <button
                  type="button"
                  aria-label="Clear find"
                  onClick={() => setFindQuery('')}
                  style={{ background: 'transparent', border: 'none', color: 'var(--paper-dim)', cursor: 'pointer', padding: 0, fontSize: 'var(--text-2xs)' }}
                >
                  ×
                </button>
              )}
            </label>
            <ChangeLensPopover current={lens.type} options={changeLensOptions} onPick={handleChangeLens} />
            <button
              type="button"
              className="t-mono t-faint"
              aria-label={`Sort by ${SORT_LABELS[sortBy]}, click to change`}
              style={{ fontSize: "var(--text-2xs)", display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', background: 'transparent', border: 'none', padding: 4, margin: -4, fontFamily: 'inherit', color: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit' }}
              onClick={() => setSortBy(SORT_CYCLE[(SORT_CYCLE.indexOf(sortBy) + 1) % SORT_CYCLE.length]!)}
            >
              sort: {SORT_LABELS[sortBy]} <Icon name="arrowD" size={10} />
            </button>
            <Btn sm variant="primary" onClick={() => setShowAddModal(true)}>
              <Icon name="plus" size={10} /> add game
            </Btn>
          </div>
          {/* Row 2: plat label · platform chips · (spacer) · secondary
              tag-triple popovers (those NOT primary on this lens). */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className="t-up t-faint" style={{ fontSize: "var(--text-3xs)" }}>plat</span>
            <Chip on={platFilter === 'all'} onClick={() => setPlatFilter('all')}>all</Chip>
            <Chip on={platFilter === 'ST'} onClick={() => setPlatFilter(platFilter === 'ST' ? 'all' : 'ST')} ariaLabel="Filter by Steam"><Plat code="ST" /></Chip>
            <Chip on={platFilter === 'PS'} onClick={() => setPlatFilter(platFilter === 'PS' ? 'all' : 'PS')} ariaLabel="Filter by PlayStation"><Plat code="PS" /></Chip>
            <Chip on={platFilter === 'XB'} onClick={() => setPlatFilter(platFilter === 'XB' ? 'all' : 'XB')} ariaLabel="Filter by Xbox"><Plat code="XB" /></Chip>
            <Chip on={platFilter === 'GG'} onClick={() => setPlatFilter(platFilter === 'GG' ? 'all' : 'GG')} ariaLabel="Filter by GOG"><Plat code="GG" /></Chip>
            <Chip on={platFilter === 'IT'} onClick={() => setPlatFilter(platFilter === 'IT' ? 'all' : 'IT')} ariaLabel="Filter by itch.io"><Plat code="IT" /></Chip>
            <Chip on={platFilter === 'EP'} onClick={() => setPlatFilter(platFilter === 'EP' ? 'all' : 'EP')} ariaLabel="Filter by Epic Games"><Plat code="EP" /></Chip>
            <Chip on={platFilter === 'NT'} onClick={() => setPlatFilter(platFilter === 'NT' ? 'all' : 'NT')} ariaLabel="Filter by Nintendo"><Plat code="NT" /></Chip>
            <span style={{ flex: 1 }} />
            {(() => {
              const fullShelf = filteredData?.games ?? [];
              return secondaryDims.map((d) => {
                const opts = pickTopTagCounts(fullShelf, d.id);
                if (d.active && !opts.some((o) => o.name === d.active)) {
                  opts.unshift({ name: d.active, count: 0 });
                }
                if (opts.length === 0) return null;
                return (
                  <div key={d.id} data-testid={`library-${d.id}-filter`} style={{ minWidth: 0 }}>
                    <FilterPopover
                      label={d.label}
                      value={d.active}
                      options={opts}
                      onChange={(next) => setTagFilter(d.id, next)}
                    />
                  </div>
                );
              });
            })()}
          </div>
        </div>
        <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '24px 32px 40px' }}>
          {items.length === 0 ? (
            <span className="t-mono t-faint" style={{ fontSize: "var(--text-xs)" }}>// no titles in this shelf yet</span>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {items.map(g => <ShelfItem key={g.id} g={g} w={coverDims.w} h={coverDims.h} isBacklog={isBacklog} showHltb={prefs.showHltb} />)}
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {modalElement}
      <TopBar crumbs={['hoard', 'library']} />

      {/* Filter bar — shelves view only.
          Sort + platform filter were removed in PR A (decision D4): they
          operated on the top-12 per shelf returned by the shelves endpoint,
          which silently misled users into thinking sort applied to the full
          shelf. Both controls live on the filtered single-shelf page where
          the full set is loaded. The view-mode chips (shelves/grid/list) were
          removed too — grid + list layouts were never built. */}
      <div style={{ padding: '20px 32px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <label htmlFor="library-search" className="field" style={{ width: 320, cursor: 'text' }}>
            <span className="pre">$</span>
            <span style={{ color: 'var(--paper)' }}>find</span>
            <input
              id="library-search"
              ref={searchInputRef}
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={`${totalGames} games · type to filter`}
              aria-label="Search your library"
              style={{
                flex: 1, minWidth: 0,
                background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--paper)', fontFamily: 'inherit', fontSize: 'inherit', letterSpacing: 'inherit',
                padding: 0,
              }}
            />
            {searchInput ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => { setSearchInput(''); searchInputRef.current?.focus(); }}
                style={{ background: 'transparent', border: 'none', color: 'var(--paper-dim)', cursor: 'pointer', padding: 0, fontSize: 'var(--text-2xs)' }}
              >
                ×
              </button>
            ) : (
              <span style={{ marginLeft: 'auto', fontSize: "var(--text-3xs)", color: 'var(--paper-dim)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="search" size={11} /> /
              </span>
            )}
          </label>
          <span style={{ flex: 1 }} />
          <Btn sm variant="primary" onClick={() => setShowAddModal(true)}>
            <Icon name="plus" size={10} /> add game
          </Btn>
        </div>

      {/* search results OR shelves OR empty-state CTA */}
      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '0 32px 40px' }}>
        {isSearching ? (
          (() => {
            const results = (searchData?.games ?? []).map(toGameDisplay);
            const headerNote = searchLoading ? '// searching…' : `// ${results.length} match${results.length === 1 ? '' : 'es'} in your library`;
            return (
              <div style={{ paddingTop: 18 }}>
                <Marker>{headerNote}</Marker>
                {results.length === 0 && !searchLoading ? (
                  <p style={{ marginTop: 14, color: 'var(--paper-dim)', fontSize: "var(--text-sm)" }}>
                    no titles in your library match "{trimmedQuery}". use Cmd-K to search the full IGDB catalogue.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 16 }}>
                    {results.map(g => (
                      <ShelfItem key={g.id} g={g} w={coverDims.w} h={coverDims.h} isBacklog={false} showHltb={prefs.showHltb} />
                    ))}
                  </div>
                )}
              </div>
            );
          })()
        ) : totalGames === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
            <div className="panel" style={{ padding: 32, maxWidth: 480, width: '100%', textAlign: 'center' }}>
              <Marker>// no titles yet</Marker>
              <p style={{ marginTop: 14, color: 'var(--paper-dim)', fontSize: "var(--text-sm)", lineHeight: 1.55 }}>
                your library is empty. connect a platform to sync your games, or add one manually.
              </p>
              <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Btn variant="primary" onClick={() => navigate('/settings/platforms')}>
                  <Icon name="link" size={11} /> connect a platform
                </Btn>
                <Btn onClick={() => setShowAddModal(true)}>
                  <Icon name="plus" size={11} /> add a game
                </Btn>
              </div>
            </div>
          </div>
        ) : (
          shelves.map((s, i) => (
            <Shelf key={s.status} idx={i + 1} shelf={s} coverW={coverDims.w} coverH={coverDims.h} showHltb={prefs.showHltb} />
          ))
        )}
        {/* B-IGDB-3b2 follow-up — browse-by entry-points are in the
            Sidebar on desktop (always-visible Steam-style left rail),
            not duplicated here. Mobile still renders the inline
            BrowseByPanel below shelves since there's no sidebar. */}
      </div>
    </>
  );
}
