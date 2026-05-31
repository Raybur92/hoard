/**
 * Dashboard — DASH-PR1 bento-box layout structural assertions.
 *
 * The visible spans communicate importance per PAGES_PLAN §7.4:
 * - span-6 hero      (now-playing + active rotation)
 * - span-3 countdown (next release)
 * - span-4 stat card (backlog picker · completion · achievements)
 * - span-6 panel     (genre breakdown · hours by platform)
 * - span-12 temporal (activity heatmap)
 *
 * A swap (e.g. now-playing dropping to span-3) would mean a real layout
 * regression. data-bento-span on each BentoCard makes the grid introspectable
 * without scraping inline styles. Mobile is 1-col span-order; we assert
 * card presence + order, not span numbers.
 *
 * Also pins the two removed sections (the 8-tile `// the hoard · in numbers`
 * grid + the multi-card `// wishlist · dropping soon` panel) as gone — those
 * were live decisions in DASH-PR1, easy to accidentally re-add.
 */

import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { DashboardDesktop } from '../DashboardDesktop';
import { DashboardMobile } from '../DashboardMobile';
import { UserProvider } from '../../../contexts/UserContext';
import { PreferencesProvider } from '../../../contexts/PreferencesContext';
import { SearchModalProvider } from '../../../hooks/useSearchModal';
import { _resetForTests } from '../../../lib/cache';
import type { DashboardResponse, UserGameDetail, WishlistRelease } from '@hoard/types';

function makeGame(id: string, title: string, lastPlayedAt: string, mins: number): UserGameDetail {
  return {
    id,
    status: 'Playing',
    notes: null,
    rating: null,
    addedAt: '2026-01-01T00:00:00.000Z',
    lastPlayedAt,
    playtimeByPlatform: { ST: mins },
    achievementsByPlatform: {},
    wishlistedPlatforms: [],
    mediaType: 'DIGITAL',
    condition: null,
    region: null,
    manualPlaytimeMinutes: null,
    game: {
      id: `game-${id}`,
      igdbId: 100 + Number(id.replace(/\D/g, '')),
      title,
      slug: title.toLowerCase().replace(/\s+/g, '-'),
      developer: 'dev',
      publisher: 'pub',
      releaseYear: 2024,
      coverUrl: null,
      heroImageUrl: null,
      genres: ['action'],
      platforms: ['Steam'],
      summary: null,
      steamAppId: null,
    },
    hltb: { mainStory: 600, mainExtra: 1200, completionist: 2400, fetchedAt: '2026-01-01T00:00:00.000Z' },
  } as unknown as UserGameDetail;
}

function makeRelease(id: string, title: string, daysFromNow: number): WishlistRelease {
  return {
    id,
    igdbId: 5000 + Number(id.replace(/\D/g, '') || '0'),
    title,
    developer: 'dev',
    releaseDate: new Date(Date.now() + daysFromNow * 86_400_000).toISOString(),
    releaseDateCategory: 'exact',
    platforms: ['PlayStation 5'],
    genres: ['action'],
    userId: 'u1',
    hype: 100,
    synopsis: 'syn',
    coverUrl: null,
    heroImageUrl: null,
    category: 0,
  };
}

const sampleData = (overrides: Partial<DashboardResponse> = {}): DashboardResponse => ({
  stats: {
    totalGames: 100,
    playingCount: 3,
    backlogCount: 40,
    completedCount: 20,
    onHoldCount: 5,
    droppedCount: 2,
    wishlistCount: 30,
    totalPlaytimeMinutes: 60_000,
    completionPct: 20,
    weeklyAdded: 2,
    playtimeByPlatform: [{ code: 'ST', label: 'Steam', minutes: 60_000, pct: 100 }],
    genres: [{ name: 'action', count: 50 }, { name: 'rpg', count: 30 }],
    themes: [{ name: 'fantasy', count: 40 }, { name: 'sci-fi', count: 22 }],
    playerPerspectives: [{ name: 'third-person', count: 56 }, { name: 'first-person', count: 18 }],
    achievementsRollup: { earned: 200, total: 800, percent: 25 },
    period: 'all',
    periodStats: {
      completedCount: 20,
      totalGames: 100,
      completionPct: 20,
      achievementsRollup: { earned: 200, total: 800, percent: 25 },
    },
  },
  nowPlaying: [
    makeGame('1', 'Elden Ring', '2026-05-25T12:00:00.000Z', 2820),
    makeGame('2', 'Hollow Knight', '2026-05-24T12:00:00.000Z', 780),
    makeGame('3', 'Cyberpunk 2077', '2026-05-23T12:00:00.000Z', 1440),
  ],
  wishlistCountdown: [
    makeRelease('w1', 'Silksong', 30),
    makeRelease('w2', 'GTA VI', 180),
  ],
  backlogPick: makeGame('b1', 'Dark Souls', '2026-01-01T00:00:00.000Z', 0),
  backlogItems: [makeGame('b1', 'Dark Souls', '2026-01-01T00:00:00.000Z', 0)],
  platforms: [
    {
      code: 'ST', userId: 'u1', lastSyncAt: '2026-05-30T10:00:00.000Z', syncStatus: 'ok',
      syncFrequency: 'HOURLY', credentials: {}, scopes: ['library'], errorMessage: null,
    } as unknown as DashboardResponse['platforms'][0],
  ],
  activity: { weeks: 24, cells: new Array(24 * 7).fill(0) },
  wishlistDealsCount: 0,
  ...overrides,
});

vi.mock('../../../lib/api', () => ({
  api: {
    me: vi.fn().mockResolvedValue({
      id: 'u1',
      email: 'andrea@test',
      name: 'andrea',
      createdAt: '2023-01-01T00:00:00.000Z',
      status: 'ACTIVE',
      isAdmin: false,
      hasRequestedAccess: false,
      preferences: {
        hypeThreshold: 5,
        libraryView: 'shelves',
        showHltb: true,
        coverDensity: 'standard',
        terminalCursor: true,
      },
    }),
    dashboard: vi.fn(),
    platformStatus: vi.fn().mockResolvedValue({ platforms: [] }),
    logout: vi.fn().mockResolvedValue(undefined),
    updateMe: vi.fn(),
  },
}));

import { api } from '../../../lib/api';

function Providers({ children, route = '/' }: { children: ReactNode; route?: string }) {
  return (
    <MemoryRouter initialEntries={[route]}>
      <UserProvider>
        <PreferencesProvider>
          <SearchModalProvider>{children}</SearchModalProvider>
        </PreferencesProvider>
      </UserProvider>
    </MemoryRouter>
  );
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('min-width: 1024px'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  _resetForTests();
});

describe('DashboardDesktop — bento-box layout', () => {
  it('renders the bento grid with the expected cards in span-order', async () => {
    (api.dashboard as ReturnType<typeof vi.fn>).mockResolvedValue(sampleData());

    const { findByTestId, queryByTestId } = render(
      <Providers>
        <DashboardDesktop />
      </Providers>,
    );

    await findByTestId('bento-grid');

    // Cards present (per §7.4 matrix entries that ship today). DASH-PR2
    // merged completion + achievements into a single `card-progress` card
    // because they always shared the same period scope — toggle is shown
    // once instead of duplicated.
    expect(queryByTestId('card-now-playing')).not.toBeNull();
    expect(queryByTestId('card-next-release')).not.toBeNull();
    expect(queryByTestId('card-backlog-picker')).not.toBeNull();
    expect(queryByTestId('card-progress')).not.toBeNull();
    // Both halves render inside the combined card.
    expect(queryByTestId('progress-completion')).not.toBeNull();
    expect(queryByTestId('progress-achievements')).not.toBeNull();
    expect(queryByTestId('card-breakdown')).not.toBeNull();
    expect(queryByTestId('card-platforms')).not.toBeNull();
    expect(queryByTestId('card-heatmap')).not.toBeNull();
  });

  it('assigns the correct grid spans per §7.4 (size = importance)', async () => {
    (api.dashboard as ReturnType<typeof vi.fn>).mockResolvedValue(sampleData());

    const { findByTestId } = render(
      <Providers>
        <DashboardDesktop />
      </Providers>,
    );

    const expectedSpans: Record<string, string> = {
      'card-now-playing': '6',
      'card-backlog-picker': '4',
      // DASH-PR2 — `card-progress` (merged completion+achievements) takes
      // the previously-split span-4+span-4 footprint as a single span-8.
      // Row 2 reads: backlog-picker (4) | progress (8).
      'card-progress': '8',
      'card-breakdown': '6',
      'card-platforms': '6',
      'card-heatmap': '12',
    };

    for (const [id, span] of Object.entries(expectedSpans)) {
      const el = await findByTestId(id);
      expect(el.getAttribute('data-bento-span')).toBe(span);
    }
  });

  it('renders the active rotation sub-section when nowPlaying has more than one entry', async () => {
    (api.dashboard as ReturnType<typeof vi.fn>).mockResolvedValue(sampleData());

    const { findByText, getByText } = render(
      <Providers>
        <DashboardDesktop />
      </Providers>,
    );

    // §7.4 ASCII mockup: `// active rotation · playing × N`.
    await findByText(/active rotation · playing × 3/i);
    // Other Playing games render as compact rows (not the hero).
    expect(getByText('Hollow Knight')).not.toBeNull();
    expect(getByText('Cyberpunk 2077')).not.toBeNull();
  });

  it('hides the active rotation sub-section when only one game is Playing', async () => {
    (api.dashboard as ReturnType<typeof vi.fn>).mockResolvedValue(
      sampleData({ nowPlaying: [makeGame('1', 'Elden Ring', '2026-05-25T12:00:00.000Z', 2820)] }),
    );

    const { findByTestId, queryByText } = render(
      <Providers>
        <DashboardDesktop />
      </Providers>,
    );

    await findByTestId('card-now-playing');
    expect(queryByText(/active rotation/i)).toBeNull();
  });

  it('shows the NextReleaseCountdown card with the next wishlist release title', async () => {
    (api.dashboard as ReturnType<typeof vi.fn>).mockResolvedValue(sampleData());

    const { findByTestId } = render(
      <Providers>
        <DashboardDesktop />
      </Providers>,
    );

    const card = await findByTestId('card-next-release');
    expect(card.textContent ?? '').toContain('Silksong');
    expect(card.textContent ?? '').toContain('see all');
  });

  it('hides the alerts strip when no platform is in error state (DASH-PR3)', async () => {
    // sampleData()'s default platform list has syncStatus='ok' — strip absent.
    (api.dashboard as ReturnType<typeof vi.fn>).mockResolvedValue(sampleData());

    const { findByTestId, queryByTestId } = render(
      <Providers>
        <DashboardDesktop />
      </Providers>,
    );

    await findByTestId('bento-grid');
    expect(queryByTestId('alerts-strip')).toBeNull();
  });

  it('renders the alerts strip at the top of the bento when a platform has syncStatus=error (DASH-PR3)', async () => {
    (api.dashboard as ReturnType<typeof vi.fn>).mockResolvedValue(
      sampleData({
        platforms: [
          {
            code: 'ST', userId: 'u1', lastSyncAt: '2026-05-30T10:00:00.000Z', syncStatus: 'error',
            syncFrequency: 'HOURLY', id: 'p-st-1', syncable: true,
          } as unknown as DashboardResponse['platforms'][0],
        ],
      }),
    );

    const { findByTestId } = render(
      <Providers>
        <DashboardDesktop />
      </Providers>,
    );

    const strip = await findByTestId('alerts-strip');
    expect(strip.textContent ?? '').toContain('sync error');
    expect(strip.textContent ?? '').toContain('steam');

    // Strip is at the top of the bento — its sibling order must precede all
    // other cards. Read all children of the bento grid in document order and
    // assert the strip is index 0.
    const grid = await findByTestId('bento-grid');
    const firstChild = grid.firstElementChild;
    expect(firstChild?.getAttribute('data-testid')).toBe('alerts-strip');
  });

  it('does not render the removed `// the hoard · in numbers` stat tile grid', async () => {
    (api.dashboard as ReturnType<typeof vi.fn>).mockResolvedValue(sampleData());

    const { findByTestId, queryByText } = render(
      <Providers>
        <DashboardDesktop />
      </Providers>,
    );

    await findByTestId('bento-grid');
    // Either label phrasing from the deleted Marker would surface here.
    expect(queryByText(/the hoard · in numbers/i)).toBeNull();
    // The old grid rendered all 8 of these stat keys; check a representative
    // few (the bento-grid `card-completion` displays `completionPct` numerically
    // but never the literal `TOTAL OWNED` label).
    expect(queryByText('TOTAL OWNED')).toBeNull();
    expect(queryByText('ON HOLD')).toBeNull();
    expect(queryByText('DROPPED')).toBeNull();
  });

  it('does not render the removed multi-card `// wishlist · dropping soon` panel', async () => {
    (api.dashboard as ReturnType<typeof vi.fn>).mockResolvedValue(sampleData());

    const { findByTestId, queryByText } = render(
      <Providers>
        <DashboardDesktop />
      </Providers>,
    );

    await findByTestId('bento-grid');
    expect(queryByText(/wishlist · dropping soon/i)).toBeNull();
    // The dominant HeroCountdown's `// next release` marker survives — that's
    // the replacement. Sanity check the second wishlist entry isn't surfaced
    // (only [0] becomes the dominant countdown; the rest live on /releases).
    expect(queryByText('GTA VI')).toBeNull();
  });
});

describe('DashboardMobile — 1-col span-order layout', () => {
  beforeAll(() => {
    // Mobile breakpoint context.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
  });

  it('renders cards in OQ-DASH-1 fixed-by-importance order', async () => {
    (api.dashboard as ReturnType<typeof vi.fn>).mockResolvedValue(sampleData());

    const { findByTestId, container } = render(
      <Providers>
        <DashboardMobile />
      </Providers>,
    );

    await findByTestId('card-now-playing');

    const cards = Array.from(container.querySelectorAll('[data-testid^="card-"]'))
      .map((el) => el.getAttribute('data-testid'));

    // Spec §7.4 mobile collapse order: now-playing → next-release →
    // backlog-picker → completion → achievements → breakdown → platforms →
    // heatmap. (alerts strip absent in DASH-PR1.)
    expect(cards).toEqual([
      'card-now-playing',
      'card-next-release',
      'card-backlog-picker',
      // DASH-PR2 — merged progress card replaces the split.
      'card-progress',
      'card-breakdown',
      'card-platforms',
      'card-heatmap',
    ]);
  });
});

describe('DashboardDesktop — DASH-PR2 period toggle', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query.includes('min-width: 1024px'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
  });

  it('renders one shared period toggle in the combined progress card (not duplicated per half)', async () => {
    (api.dashboard as ReturnType<typeof vi.fn>).mockResolvedValue(sampleData());

    const { findByTestId, container } = render(
      <Providers>
        <DashboardDesktop />
      </Providers>,
    );

    const progressCard = await findByTestId('card-progress');

    // Exactly one radiogroup in the progress card (not one per half).
    // Andrea's call: if the toggle controls both, it should be shown once.
    expect(progressCard.querySelectorAll('[role="radiogroup"]')).toHaveLength(1);
    expect(progressCard.querySelectorAll('[role="radio"]')).toHaveLength(3);

    // And exactly one across the whole dashboard (no orphan toggle elsewhere).
    expect(container.querySelectorAll('[role="radiogroup"]')).toHaveLength(1);
  });

  it('defaults to period="all" and reads from stats.periodStats (not top-level all-time fields)', async () => {
    // Make periodStats values DIFFERENT from top-level all-time fields so we
    // can prove the card binds to periodStats, not the top-level mirror.
    (api.dashboard as ReturnType<typeof vi.fn>).mockResolvedValue(
      sampleData({
        stats: {
          ...sampleData().stats,
          // Top-level all-time (greeting reads these — unaffected by toggle)
          completedCount: 20,
          totalGames: 100,
          completionPct: 20,
          // Period stats (the progress card reads these). For period=all the
          // server collapses these to all-time values; the test still asserts
          // the card binds to `periodStats.*` via distinct fixture values.
          periodStats: {
            completedCount: 12,
            totalGames: 47,
            completionPct: 25.5,
            achievementsRollup: { earned: 800, total: 1200, percent: 66.7 },
          },
        },
      }),
    );

    const { findByTestId } = render(
      <Providers>
        <DashboardDesktop />
      </Providers>,
    );

    const progressCard = await findByTestId('card-progress');
    // Completion half shows periodStats numbers (25.5%, 12/47) — NOT all-time.
    expect(progressCard.textContent ?? '').toContain('25.5%');
    expect(progressCard.textContent ?? '').toContain('12');
    expect(progressCard.textContent ?? '').toContain('47');
    expect(progressCard.textContent ?? '').not.toContain('100');
    // Achievements half also shows period-scoped numbers.
    expect(progressCard.textContent ?? '').toContain('66.7%');

    // Default selection is 'all time' on the (sole) toggle.
    const allTimeChip = Array.from(progressCard.querySelectorAll('[role="radio"]'))
      .find((b) => b.textContent?.trim() === 'all time');
    expect(allTimeChip?.getAttribute('aria-checked')).toBe('true');
  });

  it('clicking the year chip refetches with ?period=year and both halves of the progress card update together', async () => {
    const dashboardMock = api.dashboard as ReturnType<typeof vi.fn>;
    dashboardMock.mockResolvedValueOnce(sampleData()); // initial 'all'
    // After period change, server returns scoped values for both halves.
    dashboardMock.mockResolvedValueOnce(
      sampleData({
        stats: {
          ...sampleData().stats,
          period: 'year',
          periodStats: {
            completedCount: 4,
            totalGames: 11,
            completionPct: 36.4,
            achievementsRollup: { earned: 90, total: 220, percent: 40.9 },
          },
        },
      }),
    );

    const { findByTestId } = render(
      <Providers>
        <DashboardDesktop />
      </Providers>,
    );

    const progressCard = await findByTestId('card-progress');
    const thisYearChip = Array.from(progressCard.querySelectorAll('[role="radio"]'))
      .find((b) => b.textContent?.trim() === 'this year') as HTMLElement;

    await act(async () => { fireEvent.click(thisYearChip); });

    // Hook + api should now request the year-scoped variant.
    await waitFor(() => {
      expect(dashboardMock).toHaveBeenCalledWith('year');
    });

    // Both halves of the progress card reflect the new period values.
    await waitFor(() => {
      const completionHalf = progressCard.querySelector('[data-testid="progress-completion"]') as HTMLElement;
      const achievementsHalf = progressCard.querySelector('[data-testid="progress-achievements"]') as HTMLElement;
      expect(completionHalf.textContent ?? '').toContain('36.4%');
      expect(completionHalf.textContent ?? '').toContain('4');
      expect(completionHalf.textContent ?? '').toContain('11');
      expect(achievementsHalf.textContent ?? '').toContain('40.9%');
      expect(achievementsHalf.textContent ?? '').toContain('90');
      expect(achievementsHalf.textContent ?? '').toContain('220');
      // Toggle reflects the new period.
      const active = Array.from(progressCard.querySelectorAll('[role="radio"]'))
        .find((b) => b.getAttribute('aria-checked') === 'true');
      expect(active?.textContent?.trim()).toBe('this year');
    });
  });

  it('keeps the previous period\'s data visible while a new period is loading (no loading-skeleton flash on chip click)', async () => {
    const dashboardMock = api.dashboard as ReturnType<typeof vi.fn>;
    dashboardMock.mockResolvedValueOnce(sampleData()); // 'all'
    // The 'month' fetch hangs so we can observe the transition state.
    let resolveMonth: (v: unknown) => void = () => {};
    dashboardMock.mockReturnValueOnce(new Promise((r) => { resolveMonth = r; }));

    const { findByTestId, queryByText } = render(
      <Providers>
        <DashboardDesktop />
      </Providers>,
    );

    const progressCard = await findByTestId('card-progress');
    // The 'all' period's 20% completion appears (sampleData() defaults).
    expect(progressCard.textContent ?? '').toContain('20%');

    const thisMonthChip = Array.from(progressCard.querySelectorAll('[role="radio"]'))
      .find((b) => b.textContent?.trim() === 'this month') as HTMLElement;
    await act(async () => { fireEvent.click(thisMonthChip); });

    // Critical assertion — the bento should NOT fall back to the loading
    // skeleton while the new period is in flight. The previous period's
    // numbers stay visible. The page still shows familiar Dashboard chrome.
    expect(queryByText(/failed to load dashboard/i)).toBeNull();
    expect(await findByTestId('card-progress')).not.toBeNull();
    // The old 20% number is still on screen (stale-while-revalidate).
    expect((await findByTestId('card-progress')).textContent ?? '').toContain('20%');

    // Clean up the pending promise so React doesn't warn.
    await act(async () => { resolveMonth(sampleData()); });
  });
});

describe('DashboardDesktop — B-IGDB-3 breakdown 3-tab strip', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query.includes('min-width: 1024px'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
  });

  it('renders the breakdown card with a 3-tab strip (genre · theme · perspective)', async () => {
    (api.dashboard as ReturnType<typeof vi.fn>).mockResolvedValue(sampleData());

    const { findByTestId } = render(
      <Providers>
        <DashboardDesktop />
      </Providers>,
    );

    const card = await findByTestId('card-breakdown');
    const tabs = card.querySelectorAll('[role="tab"]');
    expect(tabs).toHaveLength(3);
    expect(Array.from(tabs).map((t) => t.textContent?.trim())).toEqual(['genre', 'theme', 'perspective']);
  });

  it('defaults to genre tab and shows the genres series', async () => {
    (api.dashboard as ReturnType<typeof vi.fn>).mockResolvedValue(sampleData());

    const { findByTestId } = render(
      <Providers>
        <DashboardDesktop />
      </Providers>,
    );

    const card = await findByTestId('card-breakdown');
    const active = Array.from(card.querySelectorAll('[role="tab"]'))
      .find((t) => t.getAttribute('aria-selected') === 'true');
    expect(active?.textContent?.trim()).toBe('genre');
    // Genre entries from sample fixture surface.
    expect(card.textContent ?? '').toContain('action');
    expect(card.textContent ?? '').toContain('rpg');
    // Theme/perspective entries should NOT surface in the genre view.
    expect(card.textContent ?? '').not.toContain('fantasy');
    expect(card.textContent ?? '').not.toContain('third-person');
  });

  it('clicking the theme tab swaps the body to the themes series', async () => {
    (api.dashboard as ReturnType<typeof vi.fn>).mockResolvedValue(sampleData());

    const { findByTestId } = render(
      <Providers>
        <DashboardDesktop />
      </Providers>,
    );

    const card = await findByTestId('card-breakdown');
    const themeTab = Array.from(card.querySelectorAll('[role="tab"]'))
      .find((t) => t.textContent?.trim() === 'theme') as HTMLElement;

    await act(async () => { fireEvent.click(themeTab); });

    await waitFor(() => {
      expect(card.textContent ?? '').toContain('fantasy');
      expect(card.textContent ?? '').toContain('sci-fi');
      // Genre entries vanish when the theme tab is active.
      expect(card.textContent ?? '').not.toContain('action');
    });
  });

  it('disables tabs whose series is empty (e.g. no perspectives in the user library yet)', async () => {
    (api.dashboard as ReturnType<typeof vi.fn>).mockResolvedValue(
      sampleData({
        stats: {
          ...sampleData().stats,
          playerPerspectives: [],
        },
      }),
    );

    const { findByTestId } = render(
      <Providers>
        <DashboardDesktop />
      </Providers>,
    );

    const card = await findByTestId('card-breakdown');
    const perspectiveTab = Array.from(card.querySelectorAll('[role="tab"]'))
      .find((t) => t.textContent?.trim() === 'perspective') as HTMLButtonElement;
    expect(perspectiveTab.disabled).toBe(true);
  });
});
