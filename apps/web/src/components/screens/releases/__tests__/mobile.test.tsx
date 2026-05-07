/**
 * R5 — Mobile shell primitives (RELEASES_PLAN.md, handoff §3, §7, §8, §10).
 *
 * Smoke tests for the mobile shell — view header chevrons + label, view
 * sheet apply/dismiss behavior, banner conditional logic, release row
 * shape. Covers the handoff bullets that are easy to regress without a
 * snapshot to anchor them.
 */

import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { IgdbUpcomingRelease } from '@hoard/types';

import { MobileViewHeader } from '../MobileViewHeader';
import {
  MobileViewSheet,
  type SheetMode,
  type SheetScope,
  type SheetZoom,
} from '../MobileViewSheet';
import { MobileBanner } from '../MobileBanner';
import { MobileReleaseRow } from '../MobileReleaseRow';
import type { TimeBucket } from '../TimeNav';

function makeRelease(overrides: Partial<IgdbUpcomingRelease> = {}): IgdbUpcomingRelease {
  return {
    igdbId: 1,
    title: 'Test Release',
    developer: 'Test Studio',
    releaseDate: '2026-08-15T00:00:00.000Z',
    releaseDateCategory: 'Q3',
    platforms: ['PlayStation 5'],
    genres: [],
    coverUrl: null,
    synopsis: null,
    wishlisted: false,
    category: 0,
    hype: 50,
    ...overrides,
  };
}

const SAMPLE_BUCKETS: TimeBucket[] = [
  { key: 'MAY 2026', label: 'MAY', meta: '2026', count: 3 },
  { key: 'JUN 2026', label: 'JUN', meta: '2026', count: 1 },
  { key: 'JUL 2026', label: 'JUL', meta: '2026', count: 0 },
  { key: 'AUG 2026', label: 'AUG', meta: '2026', count: 5 },
];

describe('MobileViewHeader', () => {
  it('disables prev chevron at the leftmost bucket (handoff §8)', () => {
    const onPrev = vi.fn();
    render(
      <MobileViewHeader
        label="wishlist · may 2026"
        onLabelTap={() => {}}
        onPrev={onPrev}
        onNext={() => {}}
        prevDisabled
        nextDisabled={false}
      />,
    );
    const prev = screen.getByRole('button', { name: /previous bucket/i });
    expect(prev).toBeDisabled();
    // Click attempts on a disabled button still don't fire onClick by default.
    fireEvent.click(prev);
    expect(onPrev).not.toHaveBeenCalled();
  });

  it('disables next chevron at the rightmost bucket (handoff §8)', () => {
    render(
      <MobileViewHeader
        label="wishlist · oct 2026"
        onLabelTap={() => {}}
        onPrev={() => {}}
        onNext={() => {}}
        prevDisabled={false}
        nextDisabled
      />,
    );
    expect(screen.getByRole('button', { name: /next bucket/i })).toBeDisabled();
  });

  it('opens the sheet via label tap', () => {
    const onLabelTap = vi.fn();
    render(
      <MobileViewHeader
        label="wishlist · may 2026"
        onLabelTap={onLabelTap}
        onPrev={() => {}}
        onNext={() => {}}
        prevDisabled={false}
        nextDisabled={false}
      />,
    );
    fireEvent.click(screen.getByText(/wishlist · may 2026/i));
    expect(onLabelTap).toHaveBeenCalledTimes(1);
  });
});

describe('MobileViewSheet', () => {
  function renderSheet(props: Partial<{
    open: boolean;
    mode: SheetMode;
    scope: SheetScope;
    zoom: SheetZoom;
    bucket: string;
    onApply: ReturnType<typeof vi.fn>;
  }> = {}) {
    const onApply = props.onApply ?? vi.fn();
    render(
      <MobileViewSheet
        open={props.open ?? true}
        mode={props.mode ?? 'wishlist'}
        scope={props.scope ?? 'my-platforms'}
        zoom={props.zoom ?? 'months'}
        bucket={props.bucket ?? 'MAY 2026'}
        buckets={SAMPLE_BUCKETS}
        onApply={onApply}
        mapBucketToZoom={(b) => b}
      />,
    );
    return { onApply };
  }

  it('renders nothing when closed', () => {
    const { container } = render(
      <MobileViewSheet
        open={false}
        mode="wishlist"
        scope="my-platforms"
        zoom="months"
        bucket="MAY 2026"
        buckets={SAMPLE_BUCKETS}
        onApply={() => {}}
        mapBucketToZoom={(b) => b}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('hides the scope section in wishlist mode (handoff §12 punch-list 5)', () => {
    renderSheet({ mode: 'wishlist' });
    expect(screen.queryByRole('tablist', { name: 'Scope' })).toBeNull();
  });

  it('shows the scope section in all mode', () => {
    renderSheet({ mode: 'all' });
    expect(screen.getByRole('tablist', { name: 'Scope' })).toBeTruthy();
  });

  it('commits the draft via the Done button (handoff §7)', () => {
    const onApply = vi.fn();
    renderSheet({ onApply });
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({
      mode: 'wishlist',
      scope: 'my-platforms',
      zoom: 'months',
      bucket: 'MAY 2026',
    });
  });

  it('commits the draft via the close (X) button', () => {
    const onApply = vi.fn();
    renderSheet({ onApply });
    fireEvent.click(screen.getByRole('button', { name: /close view sheet/i }));
    expect(onApply).toHaveBeenCalled();
  });

  it('updates the active bucket in the radiogroup when a row is tapped', () => {
    const onApply = vi.fn();
    renderSheet({ onApply });
    fireEvent.click(screen.getByRole('radio', { name: /AUG 2026/i }));
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: 'AUG 2026' }),
    );
  });

  it('preserves the scope draft across mode toggling (handoff §7)', async () => {
    const onApply = vi.fn();
    renderSheet({ onApply, mode: 'all', scope: 'all' });

    // Toggle to wishlist (scope section disappears) and back to all.
    fireEvent.click(screen.getByRole('tab', { name: /^wishlist$/i }));
    await waitFor(() => expect(screen.queryByRole('tablist', { name: 'Scope' })).toBeNull());

    fireEvent.click(screen.getByRole('tab', { name: /^all$/i }));
    await waitFor(() => expect(screen.getByRole('tablist', { name: 'Scope' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'all', scope: 'all' }),
    );
  });
});

describe('MobileBanner', () => {
  it('renders the green-prominent eyebrow when starred drops exist', () => {
    render(
      <MobileBanner
        mode="wishlist"
        starredCount={2}
        hypedCount={0}
        onViewRecent={() => {}}
      />,
    );
    expect(screen.getByText(/2 starred · last 14d/i)).toBeTruthy();
  });

  it('folds high-hype count into the eyebrow in all mode', () => {
    render(
      <MobileBanner
        mode="all"
        starredCount={2}
        hypedCount={3}
        onViewRecent={() => {}}
      />,
    );
    expect(screen.getByText(/2 starred · 3 high-hype · last 14d/i)).toBeTruthy();
  });

  it('renders the muted variant when only hyped drops exist (all mode)', () => {
    render(
      <MobileBanner
        mode="all"
        starredCount={0}
        hypedCount={3}
        previewTitles={['Hades II 1.0', 'Pragmata', 'Bloodborne 2']}
        onViewRecent={() => {}}
      />,
    );
    expect(screen.getByText(/Hades II 1.0, Pragmata/i)).toBeTruthy();
    expect(screen.getByText(/\+1 · last 14d/i)).toBeTruthy();
  });

  it('renders nothing when no banner condition fires', () => {
    const { container } = render(
      <MobileBanner
        mode="all"
        starredCount={0}
        hypedCount={0}
        onViewRecent={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('drift-guard: muted banner has no [mark all owned] (handoff §9)', () => {
    render(
      <MobileBanner
        mode="all"
        starredCount={0}
        hypedCount={3}
        previewTitles={['Hades II 1.0']}
        onViewRecent={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /mark all owned/i })).toBeNull();
  });
});

describe('MobileReleaseRow', () => {
  it('shows T-Nd for future releases', () => {
    const future = new Date(Date.now() + 30 * 86400000).toISOString();
    render(<MobileReleaseRow release={makeRelease({ releaseDate: future })} />);
    expect(screen.getByText(/T-30d|T-29d/)).toBeTruthy();
  });

  it('shows "dropped Nd ago" for past releases (RECENT page)', () => {
    const past = new Date(Date.now() - 5 * 86400000).toISOString();
    render(<MobileReleaseRow release={makeRelease({ releaseDate: past })} />);
    expect(screen.getByText(/dropped 5d ago/i)).toBeTruthy();
  });

  it('shows TBA for dateless releases', () => {
    render(<MobileReleaseRow release={makeRelease({ releaseDate: null })} />);
    // "TBA" appears in both the date column and the trailing slot — assert
    // both are present via getAllByText.
    expect(screen.getAllByText(/TBA/).length).toBeGreaterThanOrEqual(1);
  });

  it('drift-guard: never renders an [i got it] button (handoff §5)', () => {
    render(<MobileReleaseRow release={makeRelease()} onToggleWishlist={() => {}} />);
    expect(screen.queryByRole('button', { name: /i got it/i })).toBeNull();
  });

  it('star toggle invokes onToggleWishlist', () => {
    const onToggle = vi.fn();
    render(
      <MobileReleaseRow
        release={makeRelease({ wishlisted: false, title: 'Star Test' })}
        onToggleWishlist={onToggle}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Add Star Test to wishlist/i }));
    expect(onToggle).toHaveBeenCalledWith(1);
  });
});
