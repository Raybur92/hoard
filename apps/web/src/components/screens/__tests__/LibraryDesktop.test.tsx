/**
 * LibraryDesktop — 6-shelf-headers structural assertion.
 *
 * Picks up the deletion from docs/E2E_RESTORATION_PLAN.md §4.3:
 * the `Library / shows all 6 shelves` E2E test iterated 6 hardcoded
 * label strings and checked each was visible. Labels are derived from
 * SHELF_CONFIG inside LibraryDesktop.tsx — backend can't influence them.
 * vitest with mocked shelves data covers the property without an API.
 *
 * Order assertion is deliberate: SHELF_CONFIG order is the visible
 * shelf order on the page (Now Playing → On Hold → Completed → Backlog
 * → Dropped → Wishlist) and a swap would be a real bug. CLAUDE.md's
 * documented shelf order pins the contract.
 */

import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { LibraryDesktop } from '../LibraryDesktop';
import { UserProvider } from '../../../contexts/UserContext';
import { PreferencesProvider } from '../../../contexts/PreferencesContext';
import { SearchModalProvider } from '../../../hooks/useSearchModal';
import { _resetForTests } from '../../../lib/cache';

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
    games: vi.fn().mockResolvedValue({
      games: [],
      total: 0,
      page: 1,
      limit: 50,
      hasMore: false,
    }),
    // Non-zero counts ensure totalGames > 0 so LibraryDesktop renders all
    // 6 shelves instead of falling through to the "no titles yet" empty
    // state. Items are empty per shelf — we're asserting on headers, not
    // contents, so each shelf renders the label + a "view all" placeholder.
    shelves: vi.fn().mockResolvedValue({
      shelves: {
        Playing: [],
        Backlog: [],
        Completed: [],
        'On Hold': [],
        Dropped: [],
        Wishlist: [],
      },
      counts: {
        Playing: 1,
        Backlog: 1,
        Completed: 1,
        'On Hold': 1,
        Dropped: 1,
        Wishlist: 1,
      },
    }),
    gameCounts: vi.fn().mockResolvedValue({
      counts: {
        Playing: 1,
        Backlog: 1,
        Completed: 1,
        'On Hold': 1,
        Dropped: 1,
        Wishlist: 1,
      },
    }),
    platformStatus: vi.fn().mockResolvedValue({ platforms: [] }),
    // B-IGDB-3b2 — LibraryDesktop now reads lens-index on every render
    // (overview + lens-route slug resolution). Default empty arrays so
    // the overview renders without a browse-by panel.
    lensIndex: vi.fn().mockResolvedValue({ genre: [], theme: [], perspective: [] }),
    logout: vi.fn().mockResolvedValue(undefined),
    updateMe: vi.fn(),
  },
}));

function Providers({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/library']}>
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
  class StubResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (window as unknown as { ResizeObserver: typeof StubResizeObserver }).ResizeObserver =
    StubResizeObserver;
});

beforeEach(() => {
  vi.clearAllMocks();
  _resetForTests();
});

describe('LibraryDesktop — shelf headers (mirrors deleted E2E test)', () => {
  it('renders all 6 shelf headers in SHELF_CONFIG order', async () => {
    const { container } = render(
      <Providers>
        <LibraryDesktop />
      </Providers>,
    );

    // Shelf labels render inside `.shelf-label .name` once data resolves.
    await waitFor(() => {
      const names = Array.from(container.querySelectorAll('.shelf-label .name')).map(
        (n) => n.textContent?.trim() ?? '',
      );
      expect(names).toEqual([
        'Now Playing',
        'On Hold',
        'Completed',
        'Backlog',
        'Dropped',
        'Wishlist',
      ]);
    });
  });
});
