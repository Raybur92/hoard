/**
 * B-IGDB-3b2 follow-up — Sidebar browse-by section tests.
 *
 * The lens-index data drives a Steam-style left-rail navigation:
 * three collapsible groups (genre · theme · perspective). Each
 * defaults collapsed; auto-opens when the active route is on its
 * dimension. Click a header → toggles. Click a value → navigates to
 * the primary-lens route. "show all" toggle reveals entries beyond
 * top-5 inline.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { MemoryRouter, useLocation, Routes, Route } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Sidebar } from '../Sidebar';
import { UserProvider } from '../../../contexts/UserContext';
import { _resetForTests } from '../../../lib/cache';

vi.mock('../../../lib/api', () => ({
  api: {
    me: vi.fn().mockResolvedValue({
      id: 'u1', email: 'a@b', name: 'andrea', createdAt: '2023-01-01T00:00:00.000Z',
      status: 'ACTIVE', isAdmin: false, hasRequestedAccess: false,
      preferences: { hypeThreshold: 5, libraryView: 'shelves', showHltb: true, coverDensity: 'standard', terminalCursor: true },
    }),
    platformStatus: vi.fn().mockResolvedValue({ platforms: [] }),
    gameCounts: vi.fn().mockResolvedValue({ counts: { Playing: 5 } }),
    lensIndex: vi.fn().mockResolvedValue({
      genre: [
        { name: 'Action', count: 42 },
        { name: 'RPG', count: 31 },
        { name: 'Strategy', count: 18 },
        { name: 'Adventure', count: 12 },
        { name: 'Sports', count: 9 },
        { name: 'Puzzle', count: 5 },
        { name: 'Racing', count: 3 },
      ],
      theme: [{ name: 'Fantasy', count: 22 }],
      perspective: [],
    }),
    logout: vi.fn(),
  },
}));

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname}</div>;
}

function Providers({ children, initialPath = '/library' }: { children: ReactNode; initialPath?: string }) {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <UserProvider>{children}</UserProvider>
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('min-width: 1024px'),
      media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    }),
  });
});

describe('Sidebar — browse-by groups (B-IGDB-3b2 follow-up)', () => {
  it('renders the // browse by header + three group buttons when lens-index has data', async () => {
    _resetForTests();
    render(<Providers><Sidebar /></Providers>);
    expect(await screen.findByText(/\/\/ browse by/i)).toBeInTheDocument();
    expect(await screen.findByTestId('sidebar-browse-genre')).toBeInTheDocument();
    expect(await screen.findByTestId('sidebar-browse-theme')).toBeInTheDocument();
    // Perspective has 0 entries → still hidden (group returns null on empty).
    expect(screen.queryByTestId('sidebar-browse-perspective')).toBeNull();
  });

  it('defaults to collapsed (no value items shown until expanded)', async () => {
    _resetForTests();
    render(<Providers><Sidebar /></Providers>);
    await screen.findByTestId('sidebar-browse-genre');
    expect(screen.queryByTestId('sidebar-browse-genre-opt-action')).toBeNull();
    expect(screen.queryByTestId('sidebar-browse-genre-opt-rpg')).toBeNull();
  });

  it('clicking the group header expands the values', async () => {
    _resetForTests();
    render(<Providers><Sidebar /></Providers>);
    const trigger = await screen.findByTestId('sidebar-browse-genre');
    fireEvent.click(trigger);
    expect(screen.getByTestId('sidebar-browse-genre-opt-action')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-browse-genre-opt-rpg')).toBeInTheDocument();
  });

  it('clicking a value navigates to /library/by-genre/:slug', async () => {
    _resetForTests();
    render(<Providers><Sidebar /></Providers>);
    fireEvent.click(await screen.findByTestId('sidebar-browse-genre'));
    fireEvent.click(screen.getByTestId('sidebar-browse-genre-opt-action'));
    expect(screen.getByTestId('location').textContent).toBe('/library/by-genre/action');
  });

  it('shows top-5 + a "show all N →" toggle when > 5 values', async () => {
    _resetForTests();
    render(<Providers><Sidebar /></Providers>);
    fireEvent.click(await screen.findByTestId('sidebar-browse-genre'));
    // 5 visible by default
    expect(screen.getByTestId('sidebar-browse-genre-opt-action')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-browse-genre-opt-sports')).toBeInTheDocument();
    // 6th + 7th hidden
    expect(screen.queryByTestId('sidebar-browse-genre-opt-puzzle')).toBeNull();
    expect(screen.queryByTestId('sidebar-browse-genre-opt-racing')).toBeNull();
    expect(screen.getByTestId('sidebar-browse-genre-showall')).toHaveTextContent(/show all 7/i);
  });

  it('"show all" reveals every value and hides the toggle', async () => {
    _resetForTests();
    render(<Providers><Sidebar /></Providers>);
    fireEvent.click(await screen.findByTestId('sidebar-browse-genre'));
    fireEvent.click(screen.getByTestId('sidebar-browse-genre-showall'));
    expect(screen.getByTestId('sidebar-browse-genre-opt-puzzle')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-browse-genre-opt-racing')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-browse-genre-showall')).toBeNull();
  });

  it('auto-opens the group whose lens is active in the URL', async () => {
    _resetForTests();
    render(
      <Providers initialPath="/library/by-genre/action">
        <Sidebar />
      </Providers>,
    );
    // Group is open without manual click since URL matches genre lens.
    expect(await screen.findByTestId('sidebar-browse-genre-opt-action')).toBeInTheDocument();
    // Active value is highlighted via aria-current=page.
    expect(screen.getByTestId('sidebar-browse-genre-opt-action')).toHaveAttribute('aria-current', 'page');
  });
});
