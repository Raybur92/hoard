/**
 * Legacy URL redirects — RELEASES_PLAN.md §1 / decision D1.
 *
 * Picks up the deletion from docs/E2E_RESTORATION_PLAN.md §4.3:
 * the `/upcoming → /releases` redirect was an E2E test that proved
 * pure client-side router behavior. MemoryRouter exercises the same
 * property exhaustively without booting the API.
 */

import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../App';

vi.mock('../lib/api', () => ({
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
    dashboard: vi.fn().mockResolvedValue({
      stats: {
        totalGames: 0,
        playingCount: 0,
        backlogCount: 0,
        completedCount: 0,
        onHoldCount: 0,
        droppedCount: 0,
        wishlistCount: 0,
        totalPlaytimeMinutes: 0,
        completionPct: 0,
        weeklyAdded: 0,
        playtimeByPlatform: [],
        genres: [],
      },
      nowPlaying: [],
      wishlistCountdown: [],
      backlogPick: null,
      backlogItems: [],
      platforms: [],
      activity: { weeks: 24, cells: new Array(24 * 7).fill(0) },
    }),
    games: vi.fn().mockResolvedValue({ games: [], total: 0, page: 1, limit: 50, hasMore: false }),
    shelves: vi.fn().mockResolvedValue({
      shelves: {
        Playing: [],
        Backlog: [],
        Completed: [],
        'On Hold': [],
        Dropped: [],
        Wishlist: [],
      },
      counts: {},
    }),
    gameCounts: vi.fn().mockResolvedValue({ counts: {} }),
    platformStatus: vi.fn().mockResolvedValue({ platforms: [] }),
    upcoming: vi.fn().mockResolvedValue([]),
    igdbUpcoming: vi.fn().mockResolvedValue([]),
    logout: vi.fn().mockResolvedValue(undefined),
    updateMe: vi.fn(),
  },
}));

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
  class StubResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (window as unknown as { ResizeObserver: typeof StubResizeObserver }).ResizeObserver =
    StubResizeObserver;
});

function PathProbe() {
  const loc = useLocation();
  return <div data-testid="path">{loc.pathname}</div>;
}

describe('Legacy URL redirects', () => {
  it('/upcoming redirects to /releases (decision D1, RELEASES_PLAN.md §1)', async () => {
    const { findByTestId } = render(
      <MemoryRouter initialEntries={['/upcoming']}>
        <App />
        <PathProbe />
      </MemoryRouter>,
    );

    await waitFor(async () => {
      const probe = await findByTestId('path');
      expect(probe.textContent).toBe('/releases');
    });
  });
});
