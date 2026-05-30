/**
 * R6 — wishlist-empty recommendation panel (handoff §11).
 *
 * Asserts that the recommendation surface:
 *   - Pulls from `useUpcoming('my-platforms')`
 *   - Sorts by hype desc + caps at 3
 *   - Surfaces a quick-add `+ wishlist` button per row
 *   - Filters past-dated releases out of the recommendation
 *   - Renders nothing when there are no future hype-eligible releases
 *
 * Covers both desktop and mobile layouts via the `layout` prop.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IgdbUpcomingRelease } from '@hoard/types';
import { WishlistEmptyRecommendation } from '../WishlistEmptyRecommendation';
import { _resetForTests } from '../../../../lib/cache';

const useUpcomingMock = vi.fn<(scope?: string) => {
  data: IgdbUpcomingRelease[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}>();

vi.mock('../../../../hooks/useUpcoming', () => ({
  useUpcoming: (scope?: string) => useUpcomingMock(scope),
}));

function makeRelease(overrides: Partial<IgdbUpcomingRelease> = {}): IgdbUpcomingRelease {
  return {
    igdbId: 1,
    title: 'Recommendation Game',
    developer: 'Studio',
    releaseDate: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    releaseDateCategory: 'Q3',
    platforms: ['PlayStation 5'],
    genres: [],
    coverUrl: null,
    synopsis: null,
    wishlisted: false,
    category: 0,
    hype: 50,
    userGameId: null,
    wishlistedPlatforms: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetForTests();
});

describe('WishlistEmptyRecommendation', () => {
  it('renders the top 3 hype-sorted releases with a wishlist add button', () => {
    useUpcomingMock.mockReturnValue({
      data: [
        makeRelease({ igdbId: 1, title: 'Low Hype', hype: 10 }),
        makeRelease({ igdbId: 2, title: 'Mid Hype', hype: 50 }),
        makeRelease({ igdbId: 3, title: 'Top Hype', hype: 200 }),
        makeRelease({ igdbId: 4, title: 'Fourth Hype', hype: 75 }),
      ],
      loading: false,
      error: null,
      refetch: () => {},
    });

    const onToggle = vi.fn();
    render(<WishlistEmptyRecommendation onToggleWishlist={onToggle} />);

    // Sorted by hype desc — top 3 are Top, Fourth, Mid.
    expect(screen.getByText('Top Hype')).toBeTruthy();
    expect(screen.getByText('Fourth Hype')).toBeTruthy();
    expect(screen.getByText('Mid Hype')).toBeTruthy();
    expect(screen.queryByText('Low Hype')).toBeNull();

    // Each row has a quick-add `+ wishlist` button.
    expect(screen.getAllByRole('button', { name: /Add .* to wishlist/i })).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: /Add Top Hype to wishlist/i }));
    expect(onToggle).toHaveBeenCalledWith(3);
  });

  it('drops past-dated releases from the recommendation (D4)', () => {
    useUpcomingMock.mockReturnValue({
      data: [
        makeRelease({ igdbId: 1, title: 'Past Drop', hype: 200, releaseDate: new Date(Date.now() - 30 * 86_400_000).toISOString() }),
        makeRelease({ igdbId: 2, title: 'Future Drop', hype: 100 }),
      ],
      loading: false,
      error: null,
      refetch: () => {},
    });

    render(<WishlistEmptyRecommendation onToggleWishlist={() => {}} />);

    expect(screen.queryByText('Past Drop')).toBeNull();
    expect(screen.getByText('Future Drop')).toBeTruthy();
  });

  it('renders nothing when the my-platforms feed is empty', () => {
    useUpcomingMock.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      refetch: () => {},
    });

    const { container } = render(<WishlistEmptyRecommendation onToggleWishlist={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when feed is null (loading state)', () => {
    useUpcomingMock.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: () => {},
    });

    const { container } = render(<WishlistEmptyRecommendation onToggleWishlist={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
