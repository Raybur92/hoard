/**
 * B-IGDB-3b2 — BrowseByPanel unit tests.
 *
 * Validates the contract that survives any future visual rework:
 *   - Hides entire panel when all three dimensions are empty
 *   - Each row only renders when its dimension has entries
 *   - Default collapsed: shows TOP_N (3) + show-all link
 *   - "show all" expands to full list; link disappears
 *   - Clicking a value navigates to /library/by-X/:slug
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter, useLocation, Routes, Route } from 'react-router-dom';
import { BrowseByPanel } from '../BrowseByPanel';

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname}</div>;
}

function renderPanel(data: Parameters<typeof BrowseByPanel>[0]['data']) {
  return render(
    <MemoryRouter initialEntries={['/library']}>
      <BrowseByPanel data={data} />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BrowseByPanel', () => {
  it('returns null when data is null', () => {
    const { container } = renderPanel(null);
    expect(container.querySelector('[data-testid="browse-by-panel"]')).toBeNull();
  });

  it('returns null when every dimension is empty', () => {
    const { container } = renderPanel({ genre: [], theme: [], perspective: [] });
    expect(container.querySelector('[data-testid="browse-by-panel"]')).toBeNull();
  });

  it('renders the panel + only the populated rows', () => {
    renderPanel({
      genre: [{ name: 'RPG', count: 31 }, { name: 'Action', count: 42 }],
      theme: [],
      perspective: [{ name: 'First-person', count: 10 }],
    });
    expect(screen.getByTestId('browse-by-panel')).toBeInTheDocument();
    expect(screen.getByTestId('browse-by-genre')).toBeInTheDocument();
    expect(screen.queryByTestId('browse-by-theme')).toBeNull();
    expect(screen.getByTestId('browse-by-perspective')).toBeInTheDocument();
  });

  it('shows top-3 + a [show all N] link when > 3 values', () => {
    renderPanel({
      genre: [
        { name: 'RPG', count: 31 },
        { name: 'Action', count: 42 },
        { name: 'Strategy', count: 18 },
        { name: 'Adventure', count: 12 },
        { name: 'Sports', count: 6 },
      ],
      theme: [],
      perspective: [],
    });
    // First 3 chip buttons visible
    expect(screen.getByText('rpg')).toBeInTheDocument();
    expect(screen.getByText('action')).toBeInTheDocument();
    expect(screen.getByText('strategy')).toBeInTheDocument();
    // 4th + 5th hidden until expand
    expect(screen.queryByText('adventure')).toBeNull();
    expect(screen.queryByText('sports')).toBeNull();
    // Show-all link present
    expect(screen.getByTestId('browse-by-genre-expand')).toHaveTextContent(/show all 5/i);
  });

  it('does not show the [show all] link when ≤ 3 values', () => {
    renderPanel({
      genre: [{ name: 'RPG', count: 31 }, { name: 'Action', count: 42 }],
      theme: [],
      perspective: [],
    });
    expect(screen.queryByTestId('browse-by-genre-expand')).toBeNull();
  });

  it('expanding the row shows ALL values and hides the show-all link', () => {
    renderPanel({
      genre: [
        { name: 'RPG', count: 31 },
        { name: 'Action', count: 42 },
        { name: 'Strategy', count: 18 },
        { name: 'Adventure', count: 12 },
      ],
      theme: [],
      perspective: [],
    });
    fireEvent.click(screen.getByTestId('browse-by-genre-expand'));
    expect(screen.getByText('adventure')).toBeInTheDocument();
    expect(screen.queryByTestId('browse-by-genre-expand')).toBeNull();
  });

  it('clicking a value navigates to /library/by-X/:slug', () => {
    renderPanel({
      genre: [{ name: 'Role-playing (RPG)', count: 31 }],
      theme: [],
      perspective: [],
    });
    fireEvent.click(screen.getByText('role-playing (rpg)'));
    expect(screen.getByTestId('location').textContent).toBe('/library/by-genre/role-playing-rpg');
  });

  it('navigates to /library/by-theme for theme rows', () => {
    renderPanel({
      genre: [],
      theme: [{ name: 'Horror', count: 7 }],
      perspective: [],
    });
    fireEvent.click(screen.getByText('horror'));
    expect(screen.getByTestId('location').textContent).toBe('/library/by-theme/horror');
  });
});
