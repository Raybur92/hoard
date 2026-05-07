import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { TopBar } from '../layout/TopBar';
import { Marker } from '../primitives/Marker';
import { Btn } from '../primitives/Btn';
import { useUpcoming, type UpcomingScope } from '../../hooks/useUpcoming';
import { useQuery } from '../../hooks/useQuery';
import { api } from '../../lib/api';
import type { IgdbUpcomingRelease, RecentReleasesResponse } from '@hoard/types';
import { ReleaseCard } from './releases/ReleaseCard';
import { HeroCountdown } from './releases/HeroCountdown';
import { RecentBanner } from './releases/RecentBanner';
import { TimeNav, type TimeNavZoom } from './releases/TimeNav';
import { AgendaRail } from './releases/AgendaRail';
import { WishlistEmptyRecommendation } from './releases/WishlistEmptyRecommendation';
import {
  buildBuckets,
  defaultBucketKey,
  nextNonEmptyBucket,
  nextStarredGlobally,
  quarterCaption,
} from './releases/bucketing';

/* ────────────────────────────────────────────────────────────────────────
 * URL state
 * ──────────────────────────────────────────────────────────────────────── */

type Mode = 'wishlist' | 'all';
type Scope = 'my-platforms' | 'all';

interface ReleasesState {
  mode: Mode;
  scope: Scope;
  zoom: TimeNavZoom;
  bucket: string;
}

function parseState(params: URLSearchParams): ReleasesState {
  const mode: Mode = params.get('mode') === 'all' ? 'all' : 'wishlist';
  const scope: Scope = params.get('scope') === 'all' ? 'all' : 'my-platforms';
  const zoom: TimeNavZoom = params.get('zoom') === 'quarters' ? 'quarters' : 'months';
  const bucket = params.get('bucket') ?? defaultBucketKey(zoom);
  return { mode, scope, zoom, bucket };
}

/* ────────────────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────────────────── */

export function ReleasesDesktop() {
  useDocumentTitle('Releases');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const state = parseState(params);

  const setState = (patch: Partial<ReleasesState>) => {
    const next = new URLSearchParams(params);
    const merged: ReleasesState = { ...state, ...patch };
    // Default values are omitted from the URL — keeps shareable links clean.
    if (merged.mode === 'wishlist') next.delete('mode'); else next.set('mode', merged.mode);
    if (merged.scope === 'my-platforms') next.delete('scope'); else next.set('scope', merged.scope);
    if (merged.zoom === 'months') next.delete('zoom'); else next.set('zoom', merged.zoom);
    if (merged.bucket === defaultBucketKey(merged.zoom)) next.delete('bucket');
    else next.set('bucket', merged.bucket);
    setParams(next, { replace: true });
  };

  // Wishlist always uses scope=wishlist; All mode uses the user's chosen scope.
  const fetchScope: UpcomingScope = state.mode === 'wishlist' ? 'wishlist' : state.scope;
  const { data: feed, loading, error, refetch } = useUpcoming(fetchScope);

  // Hero needs the full wishlist regardless of mode (decision D5 — "next
  // starred globally"). Cheap parallel fetch when in 'all' mode; same cache
  // entry when in 'wishlist' mode so no extra round-trip.
  const wishlistFeed = useUpcoming('wishlist').data ?? null;

  // Banner data — hits /api/releases/recent (R1).
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

  // If the user lands on a bucket key that doesn't exist in the current zoom
  // (URL drift, zoom change), fall back to the default bucket for that zoom.
  const activeBucketKey = buckets.some((b) => b.key === state.bucket)
    ? state.bucket
    : defaultBucketKey(state.zoom);

  const visibleReleases = itemsByBucket[activeBucketKey] ?? [];

  const hero = useMemo(
    () => state.mode === 'wishlist' ? nextStarredGlobally(wishlistFeed ?? []) : null,
    [state.mode, wishlistFeed],
  );

  // Right-rail rule (handoff §6) — All Releases · Months · {month} only.
  // Wishlist views are 3-col grids (rail off); Quarters drilldowns are flat
  // (rail off); RECENT page (R4) is its own surface.
  const showRail = state.mode === 'all'
    && state.zoom === 'months'
    && activeBucketKey !== 'TBA';

  // Banner inputs from /api/releases/recent — stable shape per D7.
  const starredCount = recentData?.starred.length ?? 0;
  const hypedCount = recentData?.hyped.length ?? 0;
  const previewTitles = (recentData?.hyped ?? [])
    .slice()
    .sort((a, b) => (b.hype ?? 0) - (a.hype ?? 0))
    .map((r) => r.title);

  /* ── Wishlist toggle wired to existing endpoint ───────────────────── */

  async function handleToggleWishlist(igdbId: number) {
    try {
      await api.toggleWishlist(igdbId);
      void refetch();
    } catch { /* swallow — UI state recovers on next refetch */ }
  }

  /* ── Render ───────────────────────────────────────────────────────── */

  return (
    <>
      <TopBar crumbs={['hoard', 'releases']} />

      <ReleasesHeader
        mode={state.mode}
        scope={state.scope}
        onModeChange={(mode) => setState({ mode })}
        onScopeChange={(scope) => setState({ scope })}
      />

      {/* Banner row — sits above the time strip. Renders nothing when neither
          starred nor hyped qualifies (per handoff §4 "Hidden" row). */}
      <div style={{ padding: '14px 32px 0' }}>
        <RecentBanner
          mode={state.mode}
          starredCount={starredCount}
          hypedCount={hypedCount}
          previewTitles={previewTitles}
          onViewRecent={() => navigate('/releases/recent')}
        />
      </div>

      <div style={{ padding: '4px 32px 0', borderBottom: '1px solid var(--rule)' }}>
        <TimeNav
          buckets={buckets}
          activeKey={activeBucketKey}
          zoom={state.zoom}
          mode={state.mode}
          onSelect={(key) => setState({ bucket: key })}
          onZoomChange={(zoom) => {
            // Reset bucket to the new zoom's default when switching zooms —
            // bucket keys aren't shared between zooms.
            setState({ zoom, bucket: defaultBucketKey(zoom) });
          }}
        />
      </div>

      {/* Loading + error states */}
      {loading && !feed && (
        <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '40px 32px' }}>
          <Marker>// loading…</Marker>
        </div>
      )}

      {!loading && error && (
        <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '40px 32px' }}>
          <Marker>// couldn&rsquo;t load releases</Marker>
          <p style={{ marginTop: 14, color: 'var(--paper-dim)', fontSize: 'var(--text-sm)' }}>
            {String(error)}
          </p>
          <div style={{ marginTop: 14 }}>
            <Btn variant="primary" onClick={() => void refetch()}>retry</Btn>
          </div>
        </div>
      )}

      {!loading && !error && feed && (
        <ReleasesContent
          mode={state.mode}
          zoom={state.zoom}
          activeBucketKey={activeBucketKey}
          buckets={buckets}
          visibleReleases={visibleReleases}
          allFeedItems={items}
          hero={hero}
          showRail={showRail}
          onSkipAhead={(key) => setState({ bucket: key })}
          onToggleWishlist={(id) => void handleToggleWishlist(id)}
          onItemClick={(id) => navigate(`/game/${id}`)}
        />
      )}
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Sub-components
 * ──────────────────────────────────────────────────────────────────────── */

function ReleasesHeader({
  mode, scope,
  onModeChange, onScopeChange,
}: {
  mode: Mode; scope: Scope;
  onModeChange: (m: Mode) => void;
  onScopeChange: (s: Scope) => void;
}) {
  return (
    <div style={{ padding: '20px 32px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ display: 'inline-flex', border: '1px solid var(--rule-bright)' }} role="tablist" aria-label="Mode">
        {([['wishlist', 'WISHLIST'], ['all', 'ALL RELEASES']] as Array<[Mode, string]>).map(([k, label], i) => {
          const active = mode === k;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onModeChange(k)}
              style={{
                padding: '6px 14px',
                fontFamily: 'var(--mono)', fontSize: 'var(--text-2xs)', letterSpacing: '0.12em', textTransform: 'uppercase',
                color: active ? 'var(--void)' : 'var(--paper-dim)',
                background: active ? 'var(--paper)' : 'transparent',
                border: 'none', borderLeft: i === 0 ? 'none' : '1px solid var(--rule-bright)',
                cursor: 'pointer',
              }}
            >{label}</button>
          );
        })}
      </div>
      <span style={{ flex: 1 }} />
      {/* Scope toggle visible only in ALL mode (handoff §2). */}
      {mode === 'all' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="t-mono t-faint" style={{ fontSize: 'var(--text-3xs)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>scope</span>
          <div role="tablist" aria-label="Scope" style={{ display: 'inline-flex', border: '1px solid var(--rule)' }}>
            {([['my-platforms', 'MY PLATFORMS'], ['all', 'ALL']] as Array<[Scope, string]>).map(([k, label], i) => {
              const active = scope === k;
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onScopeChange(k)}
                  style={{
                    padding: '4px 10px', fontFamily: 'var(--mono)', fontSize: 'var(--text-3xs)', letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: active ? 'var(--paper)' : 'var(--paper-faint)',
                    background: active ? 'var(--ink-2)' : 'transparent',
                    border: 'none', borderLeft: i === 0 ? 'none' : '1px solid var(--rule)',
                    cursor: 'pointer',
                  }}
                >{label}</button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ReleasesContent({
  mode, zoom, activeBucketKey, buckets, visibleReleases, allFeedItems, hero, showRail, onSkipAhead, onToggleWishlist, onItemClick,
}: {
  mode: Mode;
  zoom: TimeNavZoom;
  activeBucketKey: string;
  buckets: ReturnType<typeof buildBuckets>['buckets'];
  visibleReleases: IgdbUpcomingRelease[];
  allFeedItems: IgdbUpcomingRelease[];
  hero: IgdbUpcomingRelease | null;
  showRail: boolean;
  onSkipAhead: (bucket: string) => void;
  onToggleWishlist: (igdbId: number) => void;
  onItemClick: (igdbId: number) => void;
}) {
  const bucketLabel = activeBucketKey.toLowerCase();
  const caption = zoom === 'quarters' ? quarterCaption(activeBucketKey) : null;

  // Wishlist mode + zero starred globally → "nothing on the horizon" empty
  // state per handoff §11. Time strip still renders above (already done).
  // Plus the "// hot this month · on your platforms" recommendation panel
  // that handoff §11 calls for — gives users an actionable next step
  // instead of a dead-end.
  if (mode === 'wishlist' && allFeedItems.length === 0) {
    return (
      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '40px 32px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0', gap: 0 }}>
          <div style={{ maxWidth: 520, width: '100%' }}>
            <div className="panel" style={{ padding: 32, textAlign: 'center' }}>
              <Marker>// nothing on the horizon</Marker>
              <p style={{ marginTop: 14, color: 'var(--paper-dim)', fontSize: 'var(--text-sm)', lineHeight: 1.55 }}>
                you haven&rsquo;t starred any upcoming releases yet. switch to <strong>all releases</strong> and tap + on something that catches your eye, or pick from the picks below.
              </p>
            </div>
            <WishlistEmptyRecommendation
              layout="desktop"
              onToggleWishlist={onToggleWishlist}
            />
          </div>
        </div>
      </div>
    );
  }

  // Empty bucket — shows skip-ahead CTA. Wishlist count vs all-mode count
  // copy differs (handoff §11).
  if (visibleReleases.length === 0) {
    const next = nextNonEmptyBucket(buckets, activeBucketKey);
    const noun = mode === 'wishlist' ? 'starred' : 'releases';
    return (
      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '40px 32px' }}>
        <Marker>// {bucketLabel} · 0 {noun}</Marker>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <span className="t-faint" style={{ fontSize: 'var(--text-sm)' }}>
            nothing {mode === 'wishlist' ? 'starred' : 'on your platforms'} this {bucketLabel}.
          </span>
          {next && (
            <Btn sm onClick={() => onSkipAhead(next.key)}>
              skip ahead → {next.label.toLowerCase()}
            </Btn>
          )}
        </div>
      </div>
    );
  }

  // Normal content. Wishlist mode = 3-col grid + hero. All mode + Months
  // bucket = 2-col grid + AgendaRail. Quarters in either mode = 3-col flat.
  const grid3Col = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
      {visibleReleases.map((r) => (
        <ReleaseCard
          key={r.igdbId}
          release={r}
          variant={mode === 'wishlist' ? 'wishlist' : 'all'}
          onToggleWishlist={onToggleWishlist}
          onClick={onItemClick}
        />
      ))}
    </div>
  );

  const grid2ColWithRail = (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 420px', minHeight: 0 }}>
      <div className="thin-scroll" style={{ overflow: 'auto', padding: '24px 32px 32px', borderRight: '1px solid var(--rule)' }}>
        <Marker>// {bucketLabel} · {visibleReleases.length} releases on your platforms</Marker>
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          {visibleReleases.map((r) => (
            <ReleaseCard
              key={r.igdbId}
              release={r}
              variant="all"
              onToggleWishlist={onToggleWishlist}
              onClick={onItemClick}
            />
          ))}
        </div>
      </div>
      <AgendaRail items={allFeedItems} mode="all" onItemClick={onItemClick} />
    </div>
  );

  if (showRail) return grid2ColWithRail;

  // Wishlist mode: hero countdown + 3-col grid below. Hero only when there's
  // a future starred globally (D5).
  if (mode === 'wishlist') {
    return (
      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '20px 32px 32px' }}>
        {hero && <HeroCountdown release={hero} onToggleWishlist={onToggleWishlist} />}
        <div style={{ marginTop: hero ? 28 : 0 }}>
          <Marker>
            // {bucketLabel} · {visibleReleases.length} starred release{visibleReleases.length === 1 ? '' : 's'}
          </Marker>
          <div style={{ marginTop: 14 }}>{grid3Col}</div>
        </div>
      </div>
    );
  }

  // All mode + Quarters → flat 3-col grid (no rail per §6 + rev06).
  return (
    <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '24px 32px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <Marker>// {bucketLabel} · {visibleReleases.length} releases</Marker>
        {caption && (
          <span className="t-mono t-faint" style={{ fontSize: 'var(--text-3xs)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            · {caption}
          </span>
        )}
      </div>
      <div style={{ marginTop: 14 }}>{grid3Col}</div>
    </div>
  );
}

