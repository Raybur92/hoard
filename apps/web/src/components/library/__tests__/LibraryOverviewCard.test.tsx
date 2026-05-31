/**
 * LibraryOverviewCard — landscape shelf card for /library overview.
 *
 * Tests the contract that survives any future visual rework:
 *   - Uses heroImageUrl when present, falls back to coverUrl
 *   - Renders title + playtime side-by-side below the cover
 *   - Cover is rendered at 16:9 (height = round(width * 9/16))
 *   - Click navigates to /game/:id
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter, useLocation, Routes, Route } from 'react-router-dom';
import { LibraryOverviewCard } from '../LibraryOverviewCard';

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname}</div>;
}

function renderCard(overrides: Partial<Parameters<typeof LibraryOverviewCard>[0]['g']> = {}) {
  const g = {
    id: 'ug-1',
    title: 'Sample Game',
    platformCode: 'ST',
    playtime: '12h',
    progress: 50,
    coverUrl: 'https://example.com/cover.jpg',
    heroImageUrl: null,
    ...overrides,
  };
  return render(
    <MemoryRouter initialEntries={['/library']}>
      <LibraryOverviewCard g={g} w={220} />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LibraryOverviewCard', () => {
  it('renders the title and playtime', () => {
    renderCard();
    expect(screen.getByText('Sample Game')).toBeInTheDocument();
    expect(screen.getByText('12h')).toBeInTheDocument();
  });

  it('uses heroImageUrl when present', () => {
    const { container } = renderCard({ heroImageUrl: 'https://example.com/hero.jpg' });
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://example.com/hero.jpg');
  });

  it('falls back to coverUrl when heroImageUrl is null', () => {
    const { container } = renderCard({ heroImageUrl: null, coverUrl: 'https://example.com/cover.jpg' });
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://example.com/cover.jpg');
  });

  it('clicking the card navigates to /game/:id', () => {
    renderCard({ id: 'ug-42' });
    fireEvent.click(screen.getByRole('button', { name: /open sample game/i }));
    expect(screen.getByTestId('location').textContent).toBe('/game/ug-42');
  });

  it('renders the cover at 16:9 (height = round(w * 9/16))', () => {
    const { container } = renderCard();
    const img = container.querySelector('img');
    // Cover uses inline width/height props from props.w + computed h.
    // h = round(220 * 9/16) = 124
    expect(img?.style.width).toBe('100%');
    expect(img?.style.height).toBe('100%');
    // The wrapper holds the 16:9 box dims.
    const wrapper = img?.parentElement;
    expect(wrapper?.style.width).toContain('220');
    expect(wrapper?.style.height).toContain('124');
  });

  it('shows the platform glyph overlay', () => {
    renderCard({ platformCode: 'PS' });
    // Plat primitive renders the code as inline text within the cover.
    expect(screen.getByText('PS')).toBeInTheDocument();
  });
});
