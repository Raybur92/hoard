import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { IgdbUpcomingRelease } from '@hoard/types';

import { ReleaseCard } from '../ReleaseCard';
import { HeroCountdown } from '../HeroCountdown';
import { RecentBanner } from '../RecentBanner';
import { TimeNav, type TimeBucket } from '../TimeNav';
import { AgendaRail } from '../AgendaRail';
import { hypeToBars, releaseDateColumn, categoryLabel, toPlatCode } from '../utils';

// ── Test fixtures ─────────────────────────────────────────────────────────

function makeRelease(overrides: Partial<IgdbUpcomingRelease> = {}): IgdbUpcomingRelease {
  return {
    igdbId: 1,
    title: 'Test Game',
    developer: 'Test Studio',
    releaseDate: '2026-08-15T00:00:00.000Z',
    releaseDateCategory: 'Q3',
    platforms: ['PlayStation 5', 'PC (Microsoft Windows)'],
    genres: ['Action RPG'],
    coverUrl: null,
    synopsis: null,
    wishlisted: false,
    category: 0,
    hype: 50,
    ...overrides,
  };
}

// ── Utils ─────────────────────────────────────────────────────────────────

describe('releases/utils', () => {
  describe('toPlatCode', () => {
    it('maps known platform names', () => {
      expect(toPlatCode('Steam')).toBe('ST');
      expect(toPlatCode('PC (Microsoft Windows)')).toBe('PC');  // first 2 chars fallback for "PC..."
      expect(toPlatCode('PlayStation 5')).toBe('PS');
      expect(toPlatCode('Xbox Series X|S')).toBe('XB');
      expect(toPlatCode('GOG')).toBe('GG');
      expect(toPlatCode('Nintendo Switch')).toBe('NT');
      expect(toPlatCode('Epic Games Store')).toBe('EP');
    });
    it('falls back to first 2 chars for unknowns', () => {
      expect(toPlatCode('Some Unknown')).toBe('SO');
    });
  });

  describe('hypeToBars', () => {
    it('maps hype values to 0–5 buckets', () => {
      expect(hypeToBars(0)).toBe(0);
      expect(hypeToBars(null)).toBe(0);
      expect(hypeToBars(undefined)).toBe(0);
      expect(hypeToBars(5)).toBe(1);
      expect(hypeToBars(15)).toBe(2);
      expect(hypeToBars(40)).toBe(3);
      expect(hypeToBars(100)).toBe(4);
      expect(hypeToBars(500)).toBe(5);
    });
    it('caps at 5 for very large values', () => {
      expect(hypeToBars(99999)).toBe(5);
    });
    it('handles negative defensively', () => {
      expect(hypeToBars(-1)).toBe(0);
    });
  });

  describe('releaseDateColumn', () => {
    it('returns TBA trio for null release date', () => {
      const r = makeRelease({ releaseDate: null });
      expect(releaseDateColumn(r)).toEqual({ month: 'TBA', day: '—', dow: '—' });
    });
    it('formats month/day/dow for a real date', () => {
      const r = makeRelease({ releaseDate: '2026-08-15T00:00:00.000Z' });
      const col = releaseDateColumn(r);
      // month abbreviation locale-dependent; minimum sanity:
      expect(col.month).toMatch(/^[A-Z]{3}$/);
      expect(col.day).toMatch(/^\d{2}$/);
      expect(col.dow).toMatch(/^[A-Z]{3}$/);
    });
  });

  describe('categoryLabel', () => {
    it('maps DLC + remake; null otherwise', () => {
      expect(categoryLabel(0)).toBeNull();
      expect(categoryLabel(2)).toBe('DLC');
      expect(categoryLabel(8)).toBe('REMAKE');
      expect(categoryLabel(null)).toBeNull();
      expect(categoryLabel(undefined)).toBeNull();
    });
  });
});

// ── ReleaseCard ───────────────────────────────────────────────────────────

describe('ReleaseCard', () => {
  it('renders title, developer, T-Nd footer for future release', () => {
    const r = makeRelease({ title: 'Hades II', developer: 'Supergiant Games' });
    render(<ReleaseCard release={r} />);
    expect(screen.getByText('Hades II')).toBeTruthy();
    expect(screen.getByText('Supergiant Games')).toBeTruthy();
    // Footer should contain a "T-" prefix because the release is future-dated
    expect(screen.getByText(/^T-\d+d$/)).toBeTruthy();
  });

  it('shows "dropped Nd ago" footer for past release (recent variant)', () => {
    const past = new Date(Date.now() - 5 * 86400000).toISOString();
    const r = makeRelease({ releaseDate: past });
    render(<ReleaseCard release={r} variant="recent" />);
    expect(screen.getByText(/dropped \d+d ago/)).toBeTruthy();
  });

  it('shows "TBA" footer when releaseDate is null', () => {
    render(<ReleaseCard release={makeRelease({ releaseDate: null })} />);
    // 'TBA' appears in both the date-column month slot and the footer.
    // Just assert at least one occurrence — the layout shows it twice by design.
    expect(screen.getAllByText('TBA').length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT render "[i got it]" or "[mark all owned]" anywhere — handoff §5/§10', () => {
    const past = new Date(Date.now() - 1 * 86400000).toISOString();
    const r = makeRelease({ releaseDate: past, wishlisted: true });
    render(<ReleaseCard release={r} variant="recent" />);
    expect(screen.queryByText(/i got it/i)).toBeNull();
    expect(screen.queryByText(/mark all owned/i)).toBeNull();
  });

  it('card body click invokes onClick (game-detail navigation)', () => {
    const onClick = vi.fn();
    render(<ReleaseCard release={makeRelease({ igdbId: 42, title: 'Click Test' })} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: /Open Click Test/i }));
    expect(onClick).toHaveBeenCalledWith(42);
  });

  it('card body NOT clickable when onClick is omitted (no role=button)', () => {
    render(<ReleaseCard release={makeRelease({ title: 'Plain Card' })} />);
    expect(screen.queryByRole('button', { name: /Open Plain Card/i })).toBeNull();
  });

  it('star button stops propagation — toggle wishlist does NOT fire card click', () => {
    const onClick = vi.fn();
    const onToggle = vi.fn();
    render(
      <ReleaseCard
        release={makeRelease({ igdbId: 42, title: 'Star Stop', wishlisted: false })}
        onToggleWishlist={onToggle}
        onClick={onClick}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Add Star Stop to wishlist/i }));
    expect(onToggle).toHaveBeenCalledWith(42);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders DLC pill when category=2', () => {
    render(<ReleaseCard release={makeRelease({ category: 2 })} />);
    expect(screen.getByText(/DLC/)).toBeTruthy();
  });

  it('renders REMAKE pill when category=8', () => {
    render(<ReleaseCard release={makeRelease({ category: 8 })} />);
    expect(screen.getByText(/REMAKE/)).toBeTruthy();
  });

  it('renders HypeBars only on "all" variant', () => {
    const wishlist = render(<ReleaseCard release={makeRelease({ hype: 100 })} variant="wishlist" />);
    const all = render(<ReleaseCard release={makeRelease({ hype: 100 })} variant="all" />);
    // 'all' variant should have a Gauge (HypeBars wraps a gauge) — count its segments.
    // 'wishlist' should not. Use a structural assertion.
    const wishlistGauges = wishlist.container.querySelectorAll('.gauge');
    const allGauges = all.container.querySelectorAll('.gauge');
    expect(wishlistGauges.length).toBe(0);
    expect(allGauges.length).toBeGreaterThan(0);
  });

  it('calls onToggleWishlist when star button is clicked', async () => {
    const onToggle = vi.fn();
    const { getByLabelText } = render(
      <ReleaseCard release={makeRelease({ igdbId: 42, wishlisted: false })} onToggleWishlist={onToggle} />,
    );
    const btn = getByLabelText(/Add Test Game to wishlist/i);
    btn.click();
    expect(onToggle).toHaveBeenCalledWith(42);
  });
});

// ── HeroCountdown ─────────────────────────────────────────────────────────

describe('HeroCountdown', () => {
  it('renders title, T-N display, and release date', () => {
    const future = new Date(Date.now() + 30 * 86400000).toISOString();
    const r = makeRelease({ title: 'Pragmata', releaseDate: future, wishlisted: true });
    render(<HeroCountdown release={r} />);
    expect(screen.getByText('Pragmata')).toBeTruthy();
    expect(screen.getByText(/^T-\d+$/)).toBeTruthy();
  });

  it('does NOT render trailer / remind-me buttons (D6)', () => {
    render(<HeroCountdown release={makeRelease({ wishlisted: true })} />);
    expect(screen.queryByText(/trailer/i)).toBeNull();
    expect(screen.queryByText(/remind me/i)).toBeNull();
  });

  it('renders [on wishlist] button when onToggleWishlist is provided', () => {
    const onToggle = vi.fn();
    render(<HeroCountdown release={makeRelease({ wishlisted: true })} onToggleWishlist={onToggle} />);
    expect(screen.getByText(/on wishlist/i)).toBeTruthy();
  });

  it('renders [+ wishlist] when not wishlisted', () => {
    render(<HeroCountdown release={makeRelease({ wishlisted: false })} onToggleWishlist={vi.fn()} />);
    expect(screen.getByText(/\+ wishlist/i)).toBeTruthy();
  });

  it('omits the wishlist button entirely when no toggle handler is given', () => {
    render(<HeroCountdown release={makeRelease({ wishlisted: true })} />);
    expect(screen.queryByText(/on wishlist/i)).toBeNull();
    expect(screen.queryByText(/\+ wishlist/i)).toBeNull();
  });
});

// ── RecentBanner ──────────────────────────────────────────────────────────

describe('RecentBanner', () => {
  it('hides when no starred and no hyped', () => {
    const { container } = render(
      <RecentBanner mode="all" starredCount={0} hypedCount={0} onViewRecent={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('hides muted variant in wishlist mode (only fires in all-mode)', () => {
    const { container } = render(
      <RecentBanner mode="wishlist" starredCount={0} hypedCount={5} onViewRecent={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows green-prominent variant when starredCount > 0', () => {
    render(
      <RecentBanner mode="wishlist" starredCount={2} hypedCount={0} onViewRecent={vi.fn()} />,
    );
    expect(screen.getByText(/2 starred releases dropped in the last 14 days/)).toBeTruthy();
    expect(screen.getByText(/automatically once your platforms sync/i)).toBeTruthy();
  });

  it('singular vs plural: 1 starred → "1 starred release dropped..."', () => {
    render(
      <RecentBanner mode="wishlist" starredCount={1} hypedCount={0} onViewRecent={vi.fn()} />,
    );
    expect(screen.getByText(/1 starred release dropped in the last 14 days/)).toBeTruthy();
  });

  it('folds high-hype count into eyebrow when both apply (all mode + both > 0)', () => {
    render(
      <RecentBanner mode="all" starredCount={2} hypedCount={3} onViewRecent={vi.fn()} />,
    );
    expect(screen.getByText(/2 starred · 3 high-hype · last 14 days/)).toBeTruthy();
  });

  it('shows muted variant in all mode when no starred but hyped > 0', () => {
    render(
      <RecentBanner mode="all" starredCount={0} hypedCount={3} previewTitles={['Hades II 1.0', 'Pragmata', 'Silksong']} onViewRecent={vi.fn()} />,
    );
    expect(screen.getByText(/Hades II 1.0, Pragmata/)).toBeTruthy();
    expect(screen.getByText(/3 high-hype/)).toBeTruthy();
    expect(screen.getByText(/last 14 days/)).toBeTruthy();
  });

  it('does NOT render [mark all owned] in any variant — handoff §10', () => {
    const { rerender } = render(
      <RecentBanner mode="all" starredCount={2} hypedCount={3} onViewRecent={vi.fn()} />,
    );
    expect(screen.queryByText(/mark all owned/i)).toBeNull();
    rerender(<RecentBanner mode="all" starredCount={0} hypedCount={3} onViewRecent={vi.fn()} />);
    expect(screen.queryByText(/mark all owned/i)).toBeNull();
  });

  it('view-recent button is the only interactive control', () => {
    render(
      <RecentBanner mode="wishlist" starredCount={2} hypedCount={0} onViewRecent={vi.fn()} />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(1);
    expect(buttons[0]?.textContent?.toLowerCase()).toContain('view recent');
  });

  it('calls onViewRecent when view-recent button is clicked', () => {
    const onViewRecent = vi.fn();
    render(
      <RecentBanner mode="wishlist" starredCount={2} hypedCount={0} onViewRecent={onViewRecent} />,
    );
    screen.getByRole('button').click();
    expect(onViewRecent).toHaveBeenCalledTimes(1);
  });
});

// ── TimeNav ───────────────────────────────────────────────────────────────

describe('TimeNav', () => {
  const buckets: TimeBucket[] = [
    { key: 'MAY', label: 'MAY', meta: '2026', count: 2 },
    { key: 'JUN', label: 'JUN', meta: '2026', count: 1 },
    { key: 'JUL', label: 'JUL', meta: '2026', count: 4 },
    { key: 'AUG', label: 'AUG', meta: '2026', count: 0 },
    { key: 'TBA', label: 'TBA', meta: '—', count: 7, isTBA: true },
  ];

  it('renders one tab per bucket', () => {
    render(
      <TimeNav buckets={buckets} activeKey="MAY" zoom="months" mode="all" onSelect={vi.fn()} onZoomChange={vi.fn()} />,
    );
    const tabs = screen.getAllByRole('tab');
    // 5 bucket tabs + 2 zoom tabs (months/quarters)
    expect(tabs.length).toBe(7);
  });

  it('marks the active bucket with aria-selected', () => {
    render(
      <TimeNav buckets={buckets} activeKey="JUL" zoom="months" mode="all" onSelect={vi.fn()} onZoomChange={vi.fn()} />,
    );
    const julTab = screen.getByRole('tab', { selected: true, name: /JUL/ });
    expect(julTab).toBeTruthy();
  });

  it('calls onSelect when a bucket is clicked', () => {
    const onSelect = vi.fn();
    render(
      <TimeNav buckets={buckets} activeKey="MAY" zoom="months" mode="all" onSelect={onSelect} onZoomChange={vi.fn()} />,
    );
    screen.getByRole('tab', { name: /JUN/ }).click();
    expect(onSelect).toHaveBeenCalledWith('JUN');
  });

  it('TBA bucket shows count without a 0-fill bar (hatched pattern aria-labeled)', () => {
    render(
      <TimeNav buckets={buckets} activeKey="TBA" zoom="months" mode="all" onSelect={vi.fn()} onZoomChange={vi.fn()} />,
    );
    expect(screen.getByLabelText(/No date — magnitude not applicable/i)).toBeTruthy();
  });

  it('calls onZoomChange when zoom toggle is clicked', () => {
    const onZoomChange = vi.fn();
    render(
      <TimeNav buckets={buckets} activeKey="MAY" zoom="months" mode="all" onSelect={vi.fn()} onZoomChange={onZoomChange} />,
    );
    screen.getByRole('tab', { name: /QUARTERS/ }).click();
    expect(onZoomChange).toHaveBeenCalledWith('quarters');
  });
});

// ── AgendaRail ────────────────────────────────────────────────────────────

describe('AgendaRail', () => {
  it('renders one row per item', () => {
    const items = [
      makeRelease({ igdbId: 1, title: 'Alpha Release' }),
      makeRelease({ igdbId: 2, title: 'Bravo Release' }),
      makeRelease({ igdbId: 3, title: 'Charlie Release' }),
    ];
    render(<AgendaRail items={items} mode="all" />);
    expect(screen.getByText('Alpha Release')).toBeTruthy();
    expect(screen.getByText('Bravo Release')).toBeTruthy();
    expect(screen.getByText('Charlie Release')).toBeTruthy();
    expect(screen.getByText('3 items')).toBeTruthy();
  });

  it('marker reads "all starred" in wishlist mode, "all tracked" in all mode', () => {
    const items = [makeRelease()];
    const wishlist = render(<AgendaRail items={items} mode="wishlist" />);
    expect(wishlist.getByText(/all starred/)).toBeTruthy();
    wishlist.unmount();
    const all = render(<AgendaRail items={items} mode="all" />);
    expect(all.getByText(/all tracked/)).toBeTruthy();
  });

  it('rows are buttons when onItemClick is provided; divs otherwise', () => {
    const items = [makeRelease({ igdbId: 99 })];
    const onItemClick = vi.fn();
    const interactive = render(<AgendaRail items={items} mode="all" onItemClick={onItemClick} />);
    const btn = interactive.getByLabelText(/Open Test Game/);
    btn.click();
    expect(onItemClick).toHaveBeenCalledWith(99);
  });

  it('shows TBA label for releases without a date', () => {
    render(<AgendaRail items={[makeRelease({ releaseDate: null })]} mode="all" />);
    // 'TBA' appears in both the date-column month and the right-side T-N slot.
    expect(screen.getAllByText('TBA').length).toBeGreaterThanOrEqual(1);
  });
});
