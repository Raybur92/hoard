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

import { render, waitFor } from '@testing-library/react';
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
    achievementsRollup: { earned: 200, total: 800, percent: 25 },
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

    // Cards present (per §7.4 matrix entries that ship today).
    expect(queryByTestId('card-now-playing')).not.toBeNull();
    expect(queryByTestId('card-next-release')).not.toBeNull();
    expect(queryByTestId('card-backlog-picker')).not.toBeNull();
    expect(queryByTestId('card-completion')).not.toBeNull();
    expect(queryByTestId('card-achievements')).not.toBeNull();
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
      'card-completion': '4',
      'card-achievements': '4',
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
      'card-completion',
      'card-achievements',
      'card-breakdown',
      'card-platforms',
      'card-heatmap',
    ]);
  });
});
