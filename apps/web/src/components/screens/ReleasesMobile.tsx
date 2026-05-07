import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Btn } from '../primitives/Btn';
import { Marker } from '../primitives/Marker';
import { Cover } from '../primitives/Cover';
import { Icon } from '../primitives/Icon';
import { PullableScroll } from '../primitives/PullableScroll';
import { useUpcoming, type UpcomingScope } from '../../hooks/useUpcoming';
import { useQuery } from '../../hooks/useQuery';
import { api } from '../../lib/api';
import { daysUntil, countdownParts } from '../../lib/utils';
import type { IgdbUpcomingRelease, RecentReleasesResponse } from '@hoard/types';

import { MobileViewHeader } from './releases/MobileViewHeader';
import {
  MobileViewSheet,
  type SheetMode,
  type SheetScope,
  type SheetZoom,
} from './releases/MobileViewSheet';
import { MobileBanner } from './releases/MobileBanner';
import { MobileReleaseRow } from './releases/MobileReleaseRow';
import { WishlistEmptyRecommendation } from './releases/WishlistEmptyRecommendation';
import {
  buildBuckets,
  defaultBucketKey,
  nextStarredGlobally,
  quarterCaption,
  visibleMonths,
  visibleQuarters,
} from './releases/bucketing';

/* ────────────────────────────────────────────────────────────────────────
 * URL state — same shape as desktop ReleasesDesktop.tsx for parity. Tab-bar
 * SOON nav lands on `/releases` without query params, so default values
 * naturally hydrate per handoff §3 (mobile resets to defaults on tab-bar
 * SOON nav). Within-session navigation preserves state via URL params.
 * ──────────────────────────────────────────────────────────────────────── */

interface ReleasesMobileState {
  mode: SheetMode;
  scope: SheetScope;
  zoom: SheetZoom;
  bucket: string;
}

function parseState(params: URLSearchParams): ReleasesMobileState {
  const mode: SheetMode = params.get('mode') === 'all' ? 'all' : 'wishlist';
  const scope: SheetScope = params.get('scope') === 'all' ? 'all' : 'my-platforms';
  const zoom: SheetZoom = params.get('zoom') === 'quarters' ? 'quarters' : 'months';
  const bucket = params.get('bucket') ?? defaultBucketKey(zoom);
  return { mode, scope, zoom, bucket };
}

/* ────────────────────────────────────────────────────────────────────────
 * Bucket map: months ↔ quarters per handoff §7 zoom-change behavior. Maps
 * the active month bucket to its containing quarter, and a quarter to the
 * first visible month of that quarter (when present in the visible window).
 * ──────────────────────────────────────────────────────────────────────── */

function mapBucketBetweenZooms(
  bucket: string,
  fromZoom: SheetZoom,
  toZoom: SheetZoom,
  today: Date = new Date(),
): string {
  if (fromZoom === toZoom) return bucket;

  if (fromZoom === 'months' && toZoom === 'quarters') {
    if (bucket === 'TBA') return 'TBA';
    const month = visibleMonths(today).find((b) => b.key === bucket);
    if (!month) return defaultBucketKey('quarters', today);
    const monthIdx = new Date(month.startMs).getMonth();
    const qIdx = (Math.floor(monthIdx / 3) + 1) as 1 | 2 | 3 | 4;
    const year = new Date(month.startMs).getFullYear();
    const targetKey = `Q${qIdx} ${year}`;
    return visibleQuarters(today).some((q) => q.key === targetKey)
      ? targetKey
      : defaultBucketKey('quarters', today);
  }

  // quarters → months
  if (bucket === 'TBA') return defaultBucketKey('months', today);
  const m = bucket.match(/^Q([1-4])\s(\d{4})$/);
  if (!m) return defaultBucketKey('months', today);
  const q = Number(m[1]);
  const year = Number(m[2]);
  const startMonthIdx = (q - 1) * 3;
  const months = visibleMonths(today);
  const target = months.find((b) => {
    const d = new Date(b.startMs);
    return d.getFullYear() === year && d.getMonth() === startMonthIdx;
  });
  return target?.key ?? months[0]!.key;
}

/* ────────────────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────────────────── */

export function ReleasesMobile() {
  useDocumentTitle('Releases');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const state = parseState(params);

  const [sheetOpen, setSheetOpen] = useState(false);

  const setState = (patch: Partial<ReleasesMobileState>) => {
    const next = new URLSearchParams(params);
    const merged: ReleasesMobileState = { ...state, ...patch };
    if (merged.mode === 'wishlist') next.delete('mode'); else next.set('mode', merged.mode);
    if (merged.scope === 'my-platforms') next.delete('scope'); else next.set('scope', merged.scope);
    if (merged.zoom === 'months') next.delete('zoom'); else next.set('zoom', merged.zoom);
    if (merged.bucket === defaultBucketKey(merged.zoom)) next.delete('bucket');
    else next.set('bucket', merged.bucket);
    setParams(next, { replace: true });
  };

  // Wishlist mode forces scope=wishlist server-side; All mode honors the
  // user-selected scope. Same shape as ReleasesDesktop.
  const fetchScope: UpcomingScope = state.mode === 'wishlist' ? 'wishlist' : state.scope;
  const { data: feed, loading, error, refetch } = useUpcoming(fetchScope);

  // Wishlist always loaded for hero (D5 — next starred globally).
  const wishlistFeed = useUpcoming('wishlist').data ?? null;

  const { data: recentData } = useQuery<RecentReleasesResponse>(
    'releases:recent',
    () => api.releasesRecent(),
  );

  /* ── Derived data ─────────────────────────────────────────────────── */

  const items: IgdbUpcomingRelease[] = useMemo(() => feed ?? [], [feed]);

  const { buckets, itemsByBucket } = useMemo(
    () => buildBuckets(items, state.zoom),
    [items, state.zoom],
  );

  const activeBucketKey = buckets.some((b) => b.key === state.bucket)
    ? state.bucket
    : defaultBucketKey(state.zoom);

  const visibleReleases = (itemsByBucket[activeBucketKey] ?? [])
    .slice()
    .sort((a, b) => {
      const ad = a.releaseDate ? new Date(a.releaseDate).getTime() : Number.POSITIVE_INFINITY;
      const bd = b.releaseDate ? new Date(b.releaseDate).getTime() : Number.POSITIVE_INFINITY;
      return ad - bd;
    });

  const hero = useMemo(
    () => state.mode === 'wishlist' ? nextStarredGlobally(wishlistFeed ?? []) : null,
    [state.mode, wishlistFeed],
  );

  const starredCount = recentData?.starred.length ?? 0;
  const hypedCount = recentData?.hyped.length ?? 0;
  const previewTitles = (recentData?.hyped ?? [])
    .slice()
    .sort((a, b) => (b.hype ?? 0) - (a.hype ?? 0))
    .map((r) => r.title);

  /* ── Chevron stepping (handoff §8) ─────────────────────────────────── */

  const activeIdx = buckets.findIndex((b) => b.key === activeBucketKey);
  const prevDisabled = activeIdx <= 0;
  const nextDisabled = activeIdx < 0 || activeIdx >= buckets.length - 1;
  const stepBucket = (delta: -1 | 1) => {
    const next = buckets[activeIdx + delta];
    if (!next) return;
    setState({ bucket: next.key });
  };

  /* ── View header label (handoff §3 + §12 punch-list 8) ─────────────── */

  const headerLabel = buildHeaderLabel(state, activeBucketKey);
  const headerSub = buildHeaderSub(state, items, hero);

  /* ── Wishlist toggle ───────────────────────────────────────────────── */

  async function handleToggleWishlist(igdbId: number) {
    try {
      await api.toggleWishlist(igdbId);
      void refetch();
    } catch { /* swallow — UI state recovers on next refetch */ }
  }

  /* ── Render ────────────────────────────────────────────────────────── */

  return (
    <>
      <MobileViewHeader
        label={headerLabel}
        sub={headerSub}
        onLabelTap={() => setSheetOpen(true)}
        onPrev={() => stepBucket(-1)}
        onNext={() => stepBucket(1)}
        prevDisabled={prevDisabled}
        nextDisabled={nextDisabled}
      />

      <MobileBanner
        mode={state.mode}
        starredCount={starredCount}
        hypedCount={hypedCount}
        previewTitles={previewTitles}
        onViewRecent={() => navigate('/releases/recent')}
      />

      {loading && !feed && (
        <div style={{ padding: '20px 16px' }}>
          <Marker>// loading…</Marker>
        </div>
      )}

      {!loading && error && (
        <div style={{ padding: '20px 16px' }}>
          <Marker>// couldn&rsquo;t load releases</Marker>
          <p style={{ marginTop: 10, color: 'var(--paper-dim)', fontSize: 'var(--text-xs)' }}>
            {String(error)}
          </p>
          <div style={{ marginTop: 10 }}>
            <Btn sm onClick={() => void refetch()}>retry</Btn>
          </div>
        </div>
      )}

      {!loading && !error && feed && (
        <ReleasesMobileContent
          mode={state.mode}
          activeBucketKey={activeBucketKey}
          zoom={state.zoom}
          allFeedItems={items}
          visibleReleases={visibleReleases}
          hero={hero}
          onToggleWishlist={(id) => void handleToggleWishlist(id)}
          onItemTap={(id) => navigate(`/game/${id}`)}
          refetch={refetch}
        />
      )}

      <MobileViewSheet
        open={sheetOpen}
        mode={state.mode}
        scope={state.scope}
        zoom={state.zoom}
        bucket={activeBucketKey}
        buckets={buckets}
        onApply={(next) => {
          setSheetOpen(false);
          setState(next);
        }}
        mapBucketToZoom={(b, fromZ, toZ) => mapBucketBetweenZooms(b, fromZ, toZ)}
      />
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Sub-components
 * ──────────────────────────────────────────────────────────────────────── */

function ReleasesMobileContent({
  mode,
  activeBucketKey,
  zoom,
  allFeedItems,
  visibleReleases,
  hero,
  onToggleWishlist,
  onItemTap,
  refetch,
}: {
  mode: SheetMode;
  activeBucketKey: string;
  zoom: SheetZoom;
  allFeedItems: IgdbUpcomingRelease[];
  visibleReleases: IgdbUpcomingRelease[];
  hero: IgdbUpcomingRelease | null;
  onToggleWishlist: (id: number) => void;
  onItemTap: (id: number) => void;
  refetch: () => void;
}) {
  const bucketLabel = activeBucketKey.toLowerCase();
  const caption = zoom === 'quarters' ? quarterCaption(activeBucketKey) : null;

  // Wishlist mode + zero starred globally — handoff §11 wishlist empty,
  // including the "// hot this month · on your platforms" recommendation
  // panel so the empty state isn't a dead-end.
  if (mode === 'wishlist' && allFeedItems.length === 0) {
    return (
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 16px' }}>
        <div className="panel" style={{ padding: 18, textAlign: 'center' }}>
          <Marker>// nothing on the horizon</Marker>
          <p style={{ marginTop: 10, color: 'var(--paper-dim)', fontSize: 'var(--text-xs)', lineHeight: 1.5 }}>
            no starred releases yet. open the view sheet and switch to <strong>all</strong> to find something to track, or pick from below.
          </p>
        </div>
        <WishlistEmptyRecommendation
          layout="mobile"
          onToggleWishlist={onToggleWishlist}
        />
      </div>
    );
  }

  // Bucket empty — handoff §11 (skip-ahead handled by chevron stepping; we
  // don't surface a separate `[skip ahead]` button on mobile since chevrons
  // serve the same function).
  if (visibleReleases.length === 0) {
    const noun = mode === 'wishlist' ? 'starred' : 'releases';
    return (
      <div style={{ padding: '20px 16px' }}>
        <Marker>// {bucketLabel} · 0 {noun}</Marker>
        <p style={{ marginTop: 8, color: 'var(--paper-dim)', fontSize: 'var(--text-xs)' }}>
          nothing {mode === 'wishlist' ? 'starred' : 'on your platforms'} this {bucketLabel}. tap the next chevron to jump ahead.
        </p>
      </div>
    );
  }

  return (
    <PullableScroll onRefresh={refetch} ariaLabel="Releases" style={{ padding: '12px 16px 0' }}>
      {mode === 'wishlist' && hero && (
        <MobileHero release={hero} onToggleWishlist={onToggleWishlist} />
      )}

      <div style={{ marginTop: mode === 'wishlist' && hero ? 16 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <Marker>
            // {bucketLabel} · {visibleReleases.length} {mode === 'wishlist' ? 'starred' : 'releases'}
          </Marker>
          {caption && (
            <span
              className="t-mono t-faint"
              style={{ fontSize: 'var(--text-3xs)', letterSpacing: '0.1em', textTransform: 'uppercase' }}
            >
              · {caption}
            </span>
          )}
        </div>

        <div style={{ marginTop: 6 }}>
          {visibleReleases.map((r) => (
            <MobileReleaseRow
              key={r.igdbId}
              release={r}
              onToggleWishlist={mode === 'wishlist' ? onToggleWishlist : undefined}
              onTap={onItemTap}
            />
          ))}
        </div>
      </div>
    </PullableScroll>
  );
}

function MobileHero({
  release,
  onToggleWishlist,
}: {
  release: IgdbUpcomingRelease;
  onToggleWishlist: (id: number) => void;
}) {
  const away = daysUntil(release.releaseDate);
  const cd = countdownParts(release.releaseDate);

  return (
    <div className="panel" style={{ padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Marker>// next drop</Marker>
        <button
          type="button"
          onClick={() => onToggleWishlist(release.igdbId)}
          aria-pressed
          aria-label={`Stop tracking ${release.title}`}
          style={{
            fontSize: 'var(--text-2xs)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: 'var(--amber)',
            background: 'transparent',
            border: 'none',
            padding: 4,
            margin: -4,
            fontFamily: 'inherit',
          }}
        >
          <Icon name="star" size={10} fill />
          on wishlist
        </button>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
        <Cover
          w={64}
          h={86}
          src={release.coverUrl}
          label={release.title.toUpperCase()}
          dev={release.developer ?? ''}
          bright
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t-display" style={{ fontSize: 32, color: 'var(--amber)', lineHeight: 0.9 }}>
            {release.releaseDate ? `T-${away}` : 'TBA'}
          </div>
          <div style={{ fontSize: 'var(--text-sm)', marginTop: 4, lineHeight: 1.15 }}>{release.title}</div>
          <div className="t-faint" style={{ fontSize: 'var(--text-3xs)', marginTop: 2 }}>
            {release.developer}
          </div>
          {cd && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3, marginTop: 8 }}>
              {(
                [
                  ['d', cd.d],
                  ['h', cd.h],
                  ['m', cd.m],
                  ['s', cd.s],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    background: 'var(--ink-2)',
                    border: '1px solid var(--rule)',
                    padding: '4px 0',
                    textAlign: 'center',
                  }}
                >
                  <div className="t-tnum" style={{ fontSize: 'var(--text-sm)', color: 'var(--amber)', lineHeight: 1 }}>
                    {v}
                  </div>
                  <div className="t-faint" style={{ fontSize: 'var(--text-3xs)', marginTop: 1 }}>
                    {k.toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Header label / sub-line composition (handoff §12 punch-list 8)
 *
 * Examples:
 *   wishlist + months   "wishlist · may 2026"
 *   all + months        "all · my-platforms · may 2026"
 *   all + quarters Q3   "all · my-platforms · q3 2026 · jul → sep"
 *   any + TBA           "wishlist · tba"
 * ──────────────────────────────────────────────────────────────────────── */

function buildHeaderLabel(state: ReleasesMobileState, activeBucketKey: string): string {
  const parts: string[] = [state.mode];
  if (state.mode === 'all') parts.push(state.scope);
  parts.push(activeBucketKey.toLowerCase());
  if (state.zoom === 'quarters') {
    const cap = quarterCaption(activeBucketKey);
    if (cap) parts.push(cap);
  }
  return parts.join(' · ');
}

function buildHeaderSub(
  state: ReleasesMobileState,
  items: IgdbUpcomingRelease[],
  hero: IgdbUpcomingRelease | null,
): string | undefined {
  if (state.mode === 'wishlist') {
    if (hero?.releaseDate) {
      const days = daysUntil(hero.releaseDate);
      return `// ${items.length} starred · next in ${days}d`;
    }
    return `// ${items.length} starred`;
  }
  return `// ${items.length} releases`;
}
