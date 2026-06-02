// EV-PR1 — frontend smoke tests for the Events list + detail screens.
// Pattern mirrors Dashboard.bento.test.tsx + EpicGuidedFlow.test.tsx:
// hooks mocked at module level, react-router wrapping each render.

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { EventsListResponse, EventDetailResponse } from '@hoard/types';

vi.mock('../../../hooks/useEvents', () => ({
  useEvents: vi.fn(),
  useEventDetail: vi.fn(),
}));

import { useEvents, useEventDetail } from '../../../hooks/useEvents';
import { EventsDesktop } from '../EventsDesktop';
import { EventDetailDesktop } from '../EventDetailDesktop';

function makeListRow(over: Partial<EventsListResponse['hero']> & { slug: string }): NonNullable<EventsListResponse['hero']> {
  return {
    slug: over.slug,
    name: over.name ?? 'State of Play',
    startTime: over.startTime ?? '2026-08-12T22:00:00Z',
    endTime: over.endTime ?? null,
    liveStreamUrl: over.liveStreamUrl ?? null,
    logoUrl: over.logoUrl ?? null,
    networks: over.networks ?? [{ name: 'Sony', type: 'YouTube', url: null }],
    gameCount: over.gameCount ?? 12,
    state: over.state ?? 'upcoming',
  };
}

const emptyResponse: EventsListResponse = {
  hero: null,
  upcoming: [],
  recent: [],
  past: [],
  counts: { upcoming: 0, past: 0 },
};

beforeEach(() => {
  (useEvents as ReturnType<typeof vi.fn>).mockReset();
  (useEventDetail as ReturnType<typeof vi.fn>).mockReset();
});

/* ── List view ───────────────────────────────────────────────────────── */

describe('EventsDesktop (list)', () => {
  it('shows the empty-state copy when no events exist', () => {
    (useEvents as ReturnType<typeof vi.fn>).mockReturnValue({
      data: emptyResponse, loading: false, error: null, refetch: vi.fn(),
    });
    render(<MemoryRouter><EventsDesktop /></MemoryRouter>);
    expect(screen.getByText(/no events yet/i)).toBeInTheDocument();
  });

  it('renders the hero card when a next-soonest upcoming event exists', () => {
    (useEvents as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        ...emptyResponse,
        hero: makeListRow({ slug: 'sgf-2026', name: 'Summer Game Fest 2026' }),
        upcoming: [makeListRow({ slug: 'sgf-2026', name: 'Summer Game Fest 2026' })],
        counts: { upcoming: 1, past: 0 },
      },
      loading: false, error: null, refetch: vi.fn(),
    });
    render(<MemoryRouter><EventsDesktop /></MemoryRouter>);
    expect(screen.getByText('Summer Game Fest 2026')).toBeInTheDocument();
    expect(screen.getByText(/next showcase/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add summer game fest 2026 to calendar/i })).toBeInTheDocument();
  });

  it('renders sectioned upcoming + recent rows', () => {
    (useEvents as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        ...emptyResponse,
        hero: null,
        upcoming: [makeListRow({ slug: 'a', name: 'Upcoming A', state: 'upcoming' })],
        recent: [
          makeListRow({
            slug: 'b', name: 'Recent B', state: 'past',
            startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          }),
        ],
        counts: { upcoming: 1, past: 1 },
      },
      loading: false, error: null, refetch: vi.fn(),
    });
    render(<MemoryRouter><EventsDesktop /></MemoryRouter>);
    expect(screen.getByText('Upcoming A')).toBeInTheDocument();
    expect(screen.getByText('Recent B')).toBeInTheDocument();
    expect(screen.getByText(/upcoming$/i)).toBeInTheDocument();
    expect(screen.getByText(/recent · last 30 days/i)).toBeInTheDocument();
  });

  it('shows an error panel with retry on hook error', () => {
    const refetch = vi.fn();
    (useEvents as ReturnType<typeof vi.fn>).mockReturnValue({
      data: null, loading: false, error: 'network down', refetch,
    });
    render(<MemoryRouter><EventsDesktop /></MemoryRouter>);
    expect(screen.getByText(/failed to load events/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});

/* ── Detail view ─────────────────────────────────────────────────────── */

function makeDetail(state: 'upcoming' | 'live' | 'past'): EventDetailResponse {
  return {
    event: {
      slug: 'state-of-play-2026-06',
      name: 'State of Play — June 2026',
      startTime: state === 'upcoming'
        ? new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
        : new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      endTime: null,
      liveStreamUrl: 'https://www.youtube.com/watch?v=abc',
      logoUrl: null,
      networks: [{ name: 'Sony', type: 'YouTube', url: null }],
      gameCount: 8,
      state,
      description: 'Quarterly Sony showcase',
      timeZone: 'America/Los_Angeles',
      videos: [{ youtubeId: 'abc123', name: 'Recap clip' }],
    },
    games: [
      {
        igdbId: 100, name: 'Game A', coverUrl: null, heroImageUrl: null,
        announcementType: null,
        userGame: { id: 'ug1', status: 'Wishlist' },
      },
      {
        igdbId: 200, name: 'Game B', coverUrl: null, heroImageUrl: null,
        announcementType: null,
        userGame: null,
      },
    ],
    personalisation: { onWishlistCount: 1, onLibraryCount: 1 },
  };
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/events/state-of-play-2026-06']}>
      <Routes>
        <Route path="/events/:slug" element={<EventDetailDesktop />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('EventDetailDesktop', () => {
  it("renders the upcoming hero with [+ add to calendar] action", () => {
    (useEventDetail as ReturnType<typeof vi.fn>).mockReturnValue({
      data: makeDetail('upcoming'), loading: false, error: null, refetch: vi.fn(),
    });
    renderDetail();
    expect(screen.getByText('State of Play — June 2026')).toBeInTheDocument();
    expect(screen.getByText(/next showcase/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add to calendar/i })).toBeInTheDocument();
  });

  it('renders the LIVE NOW banner in the live state and hides the calendar action', () => {
    (useEventDetail as ReturnType<typeof vi.fn>).mockReturnValue({
      data: makeDetail('live'), loading: false, error: null, refetch: vi.fn(),
    });
    renderDetail();
    expect(screen.getByText(/live now/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add to calendar/i })).not.toBeInTheDocument();
  });

  it("renders the 'aired N ago' caption in the past state", () => {
    (useEventDetail as ReturnType<typeof vi.fn>).mockReturnValue({
      data: makeDetail('past'), loading: false, error: null, refetch: vi.fn(),
    });
    renderDetail();
    expect(screen.getByText(/aired \d+ days? ago/i)).toBeInTheDocument();
  });

  it('shows the personalisation chip when games are on the user wishlist', () => {
    (useEventDetail as ReturnType<typeof vi.fn>).mockReturnValue({
      data: makeDetail('upcoming'), loading: false, error: null, refetch: vi.fn(),
    });
    renderDetail();
    expect(screen.getByText(/1 on your wishlist/i)).toBeInTheDocument();
  });

  it('renders the videos section as deep-link out (EV-PR3 embeds CSP-gated)', () => {
    (useEventDetail as ReturnType<typeof vi.fn>).mockReturnValue({
      data: makeDetail('past'), loading: false, error: null, refetch: vi.fn(),
    });
    renderDetail();
    const link = screen.getByRole('link', { name: /recap clip/i }) as HTMLAnchorElement;
    expect(link.href).toContain('youtube.com/watch?v=abc123');
    expect(link.target).toBe('_blank');
  });

  it('shows an error panel with retry when hook errors', () => {
    (useEventDetail as ReturnType<typeof vi.fn>).mockReturnValue({
      data: null, loading: false, error: '404', refetch: vi.fn(),
    });
    renderDetail();
    expect(screen.getByText(/event not found/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
