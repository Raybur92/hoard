/**
 * R4 — RECENT page (handoff §10).
 *
 * Smoke tests for the proper two-section layout: starred drops shown under
 * `// just out · starred` and high-hype drops under `// also released ·
 * not on your wishlist`. Empty state + drift-guards (no [mark all owned],
 * no [i got it]) included to lock in handoff §10.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { IgdbUpcomingRelease } from '@hoard/types';
import { ReleasesRecentDesktop } from '../ReleasesRecentDesktop';
import { SearchModalProvider } from '../../../hooks/useSearchModal';
import { _resetForTests } from '../../../lib/cache';

function Providers({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <SearchModalProvider>{children}</SearchModalProvider>
    </MemoryRouter>
  );
}

vi.mock('../../../lib/api', () => ({
  api: {
    releasesRecent: vi.fn(),
  },
}));

function makeRelease(overrides: Partial<IgdbUpcomingRelease> = {}): IgdbUpcomingRelease {
  return {
    igdbId: 1,
    title: 'Test Release',
    developer: 'Test Studio',
    releaseDate: '2026-05-01T00:00:00.000Z',
    releaseDateCategory: 'Q2',
    platforms: ['PC (Microsoft Windows)'],
    genres: [],
    coverUrl: null,
    synopsis: null,
    wishlisted: false,
    category: 0,
    hype: 50,
    userGameId: null,
    wishlistedPlatforms: [],
    themes: [],
    playerPerspectives: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetForTests();
});

describe('ReleasesRecentDesktop', () => {
  it('renders both sections when starred and hyped are non-empty (handoff §10)', async () => {
    const apiModule = await import('../../../lib/api');
    vi.mocked(apiModule.api.releasesRecent).mockResolvedValue({
      starred: [
        makeRelease({ igdbId: 10, title: 'Starred Alpha', wishlisted: true }),
        makeRelease({ igdbId: 11, title: 'Starred Bravo', wishlisted: true }),
      ],
      hyped: [
        makeRelease({ igdbId: 20, title: 'Hyped Charlie', hype: 90 }),
      ],
    });

    render(<Providers><ReleasesRecentDesktop /></Providers>);

    // Section markers carry the count suffix per the handoff copy.
    await waitFor(() => {
      expect(screen.getByText(/just out · starred · 2/i)).toBeTruthy();
    });
    expect(screen.getByText(/also released · not on your wishlist · 1/i)).toBeTruthy();

    expect(screen.getByText('Starred Alpha')).toBeTruthy();
    expect(screen.getByText('Starred Bravo')).toBeTruthy();
    expect(screen.getByText('Hyped Charlie')).toBeTruthy();
  });

  it('omits the "starred" section when starred is empty but hyped has items', async () => {
    const apiModule = await import('../../../lib/api');
    vi.mocked(apiModule.api.releasesRecent).mockResolvedValue({
      starred: [],
      hyped: [makeRelease({ igdbId: 20, title: 'Hyped Solo', hype: 90 })],
    });

    render(<Providers><ReleasesRecentDesktop /></Providers>);

    await waitFor(() => {
      expect(screen.getByText(/also released · not on your wishlist · 1/i)).toBeTruthy();
    });
    expect(screen.queryByText(/just out · starred/i)).toBeNull();
  });

  it('renders the empty state when both lists are empty', async () => {
    const apiModule = await import('../../../lib/api');
    vi.mocked(apiModule.api.releasesRecent).mockResolvedValue({
      starred: [],
      hyped: [],
    });

    render(<Providers><ReleasesRecentDesktop /></Providers>);

    await waitFor(() => {
      expect(screen.getByText(/nothing in the last 14 days/i)).toBeTruthy();
    });
    // One in the header, one in the empty state CTA.
    expect(screen.getAllByRole('button', { name: /back to releases/i })).toHaveLength(2);
  });

  it('renders the green prompt strip with the handoff copy when data is present', async () => {
    const apiModule = await import('../../../lib/api');
    vi.mocked(apiModule.api.releasesRecent).mockResolvedValue({
      starred: [makeRelease({ igdbId: 10, title: 'Starred Solo', wishlisted: true })],
      hyped: [],
    });

    render(<Providers><ReleasesRecentDesktop /></Providers>);

    await waitFor(() => {
      expect(
        screen.getByText(/move to your library automatically once your platforms sync/i),
      ).toBeTruthy();
    });
  });

  it('drift-guard: no [mark all owned] or [i got it] buttons anywhere (handoff §10)', async () => {
    const apiModule = await import('../../../lib/api');
    vi.mocked(apiModule.api.releasesRecent).mockResolvedValue({
      starred: [makeRelease({ igdbId: 10, title: 'Starred Drift', wishlisted: true })],
      hyped: [makeRelease({ igdbId: 20, title: 'Hyped Drift', hype: 90 })],
    });

    render(<Providers><ReleasesRecentDesktop /></Providers>);

    await waitFor(() => {
      expect(screen.getByText('Starred Drift')).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: /mark all owned/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /i got it/i })).toBeNull();
  });
});
