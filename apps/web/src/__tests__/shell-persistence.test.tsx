/**
 * Integration tests for PR 1 — persistent shell.
 *
 * Covers F1, F2, F3 from docs/PERFORMANCE_PLAN.md:
 *   F1 — Sidebar (and TopBar) stays mounted across navigations.
 *   F2 — `api.me` is called exactly once across multiple route changes.
 *   F3 — `RequireAuth` lives at the layout level and gates render once.
 */

import { render, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

vi.mock('../lib/api', () => ({
  api: {
    me: vi.fn().mockResolvedValue({
      id: 'u1',
      email: 'andrea@test',
      name: 'andrea',
      createdAt: '2023-01-01T00:00:00.000Z',
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
        totalGames: 0, playingCount: 0, backlogCount: 0, completedCount: 0,
        onHoldCount: 0, droppedCount: 0, wishlistCount: 0,
        totalPlaytimeMinutes: 0, completionPct: 0, weeklyAdded: 0,
        playtimeByPlatform: [], genres: [],
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
      shelves: { Playing: [], Backlog: [], Completed: [], 'On Hold': [], Dropped: [], Wishlist: [] },
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
  // jsdom has no matchMedia. Force desktop breakpoint.
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

  // jsdom has no ResizeObserver — Library shelves need it.
  class StubResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (window as unknown as { ResizeObserver: typeof StubResizeObserver }).ResizeObserver = StubResizeObserver;
});

beforeEach(async () => {
  const apiModule = await import('../lib/api');
  vi.mocked(apiModule.api.me).mockClear();
});

describe('PR 1 — persistent shell across navigation', () => {
  it('Sidebar DOM node is preserved across route changes (F1)', async () => {
    const { container, findByTestId, getByText } = render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    // Wait for initial auth + sidebar to appear with the resolved username.
    await findByTestId('sidebar-username');
    await waitFor(() => expect(container.querySelector('[data-testid="sidebar-username"]')?.textContent).toBe('andrea'));

    const sidebarBefore = container.querySelector('aside.sidebar');
    expect(sidebarBefore).toBeTruthy();

    // Navigate to Library via the sidebar nav item.
    fireEvent.click(getByText('Library'));
    await waitFor(() => expect(window.location.pathname === '/library' || container.querySelector('.topbar')).toBeTruthy());

    // Navigate to Releases (formerly "Upcoming" — see RELEASES_PLAN.md §1).
    fireEvent.click(getByText('Releases'));
    await waitFor(() => expect(container.querySelector('.topbar')).toBeTruthy());

    const sidebarAfter = container.querySelector('aside.sidebar');
    // Same DOM node — sidebar was never unmounted.
    expect(sidebarAfter).toBe(sidebarBefore);
    // Username still rendered (no '…' flicker).
    expect(container.querySelector('[data-testid="sidebar-username"]')?.textContent).toBe('andrea');
  });

  it('api.me is called exactly once across multiple navigations (F2)', async () => {
    const apiModule = await import('../lib/api');
    const meSpy = vi.mocked(apiModule.api.me);

    const { findByTestId, getByText, container } = render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    await findByTestId('sidebar-username');
    await waitFor(() => expect(container.querySelector('[data-testid="sidebar-username"]')?.textContent).toBe('andrea'));

    fireEvent.click(getByText('Library'));
    await waitFor(() => expect(container.querySelector('.topbar')).toBeTruthy());

    fireEvent.click(getByText('Releases'));
    await waitFor(() => expect(container.querySelector('.topbar')).toBeTruthy());

    fireEvent.click(getByText('Settings'));
    await waitFor(() => expect(container.querySelector('.topbar')).toBeTruthy());

    expect(meSpy).toHaveBeenCalledTimes(1);
  });

  it('RequireAuth blocks render with hoard-noise placeholder while auth resolves, then mounts shell once (F3)', async () => {
    // Make `me` slow so we can observe the loading state.
    const apiModule = await import('../lib/api');
    const meSpy = vi.mocked(apiModule.api.me);
    let resolveMe: (u: unknown) => void = () => {};
    meSpy.mockImplementationOnce(
      () => new Promise((resolve) => { resolveMe = resolve as (u: unknown) => void; }),
    );

    const { container, findByTestId } = render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    // Initial render shows the noise placeholder, no sidebar yet.
    expect(container.querySelector('.hoard-noise')).toBeTruthy();
    expect(container.querySelector('aside.sidebar')).toBeNull();

    // Resolve auth — the shell should mount.
    resolveMe({
      id: 'u1', email: 'andrea@test', name: 'andrea', createdAt: '2023-01-01T00:00:00.000Z',
      preferences: { hypeThreshold: 5, libraryView: 'shelves', showHltb: true, coverDensity: 'standard', terminalCursor: true },
    });
    await findByTestId('sidebar-username');

    expect(container.querySelector('aside.sidebar')).toBeTruthy();
    expect(meSpy).toHaveBeenCalledTimes(1);
  });
});
