import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IgdbSearchResult, UserGameDetail } from '@hoard/types';
import { RemapGameModal } from '../RemapGameModal';

// Re-export the real `RemapConflictError` class so the modal's `instanceof`
// check still matches what the mock throws.
vi.mock('../../../lib/api', async () => {
  const actual = await vi.importActual('../../../lib/api') as Record<string, unknown>;
  return {
    ...actual,
    api: {
      igdbSearch: vi.fn(),
      remapGame: vi.fn(),
    },
  };
});

import { api, RemapConflictError } from '../../../lib/api';

function makeResult(overrides: Partial<IgdbSearchResult> = {}): IgdbSearchResult {
  return {
    igdbId: 1,
    title: 'Test Game',
    developer: 'Test Studio',
    releaseYear: 2020,
    genres: ['Action'],
    coverUrl: null,
    platforms: ['PlayStation 5'],
    totalRatingCount: 100,
    ...overrides,
  };
}

function makeUpdated(igdbId: number, title: string): UserGameDetail {
  return {
    id: 'ug-1',
    userId: 'u1',
    gameId: 'game-x',
    game: {
      id: 'game-x',
      igdbId,
      title,
      developer: 'Mega Crit',
      releaseYear: 2019,
      genres: [],
      coverUrl: null,
      hltbId: null,
      gogAppId: null,
      psnNpCommunicationId: null,
    },
    status: 'Playing',
    playtimeByPlatform: { ST: 600 },
    lastPlayedAt: null,
    notes: 'preserved',
    rating: null,
    achievementsByPlatform: {},
    // F1-PR2 fields — null/empty defaults match sync-imported row shape
    mediaType: null,
    condition: null,
    region: null,
    wishlistedPlatforms: [],
    addedAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    hltb: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RemapGameModal', () => {
  it('pre-fills the search with the current title and shows a current-vs-new preview', () => {
    render(
      <RemapGameModal
        userGameId="ug-1"
        currentTitle="Slay the Spire 2"
        currentIgdbId={9999}
        onClose={vi.fn()}
        onRemapped={vi.fn()}
      />,
    );

    expect((screen.getByLabelText('Search IGDB by title') as HTMLInputElement).value).toBe('Slay the Spire 2');
    expect(screen.getByText('// currently')).toBeTruthy();
    expect(screen.getByText('Slay the Spire 2')).toBeTruthy();
    expect(screen.getByText('igdb #9999')).toBeTruthy();
    expect(screen.getByText('// remap to')).toBeTruthy();
    expect(screen.getByText(/pick from results below/)).toBeTruthy();
  });

  it('disables the remap button until a different result is selected', async () => {
    (api.igdbSearch as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeResult({ igdbId: 9999, title: 'Slay the Spire 2' }), // current — selecting it should stay disabled
      makeResult({ igdbId: 5000, title: 'Slay the Spire' }),
    ]);

    render(
      <RemapGameModal
        userGameId="ug-1"
        currentTitle="Slay the Spire 2"
        currentIgdbId={9999}
        onClose={vi.fn()}
        onRemapped={vi.fn()}
      />,
    );

    const remap = screen.getByRole('button', { name: /^remap$/i });
    expect((remap as HTMLButtonElement).disabled).toBe(true);

    // wait for debounced search to fire and results to render
    await waitFor(() => expect(screen.getByText('Slay the Spire')).toBeTruthy(), { timeout: 1000 });

    // selecting the current row keeps it disabled (no-op)
    fireEvent.click(screen.getByLabelText('Select Slay the Spire 2'));
    expect((remap as HTMLButtonElement).disabled).toBe(true);

    // selecting the OTHER row enables it
    fireEvent.click(screen.getByLabelText('Select Slay the Spire'));
    expect((remap as HTMLButtonElement).disabled).toBe(false);
  });

  it('calls api.remapGame and onRemapped when remap is clicked', async () => {
    (api.igdbSearch as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeResult({ igdbId: 5000, title: 'Slay the Spire' }),
    ]);
    const updated = makeUpdated(5000, 'Slay the Spire');
    (api.remapGame as ReturnType<typeof vi.fn>).mockResolvedValue(updated);
    const onRemapped = vi.fn();
    const onClose = vi.fn();

    render(
      <RemapGameModal
        userGameId="ug-1"
        currentTitle="Slay the Spire 2"
        currentIgdbId={9999}
        onClose={onClose}
        onRemapped={onRemapped}
      />,
    );

    await waitFor(() => expect(screen.getByText('Slay the Spire')).toBeTruthy(), { timeout: 1000 });
    fireEvent.click(screen.getByLabelText('Select Slay the Spire'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^remap$/i }));
    });

    expect(api.remapGame).toHaveBeenCalledWith('ug-1', 5000, false);
    expect(onRemapped).toHaveBeenCalledWith(updated);
    expect(onClose).toHaveBeenCalled();
  });

  it('surfaces a merge confirm when the server returns 409 (RemapConflictError) and retries with merge=true on confirm', async () => {
    (api.igdbSearch as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeResult({ igdbId: 5000, title: 'Slay the Spire' }),
    ]);
    const merged = makeUpdated(5000, 'Slay the Spire');
    (api.remapGame as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new RemapConflictError('ug-target', 'Slay the Spire'))
      .mockResolvedValueOnce(merged);

    const onRemapped = vi.fn();
    render(
      <RemapGameModal
        userGameId="ug-source"
        currentTitle="Slay the Spire 2"
        currentIgdbId={9999}
        onClose={vi.fn()}
        onRemapped={onRemapped}
      />,
    );

    await waitFor(() => expect(screen.getByText('Slay the Spire')).toBeTruthy(), { timeout: 1000 });
    fireEvent.click(screen.getByLabelText('Select Slay the Spire'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^remap$/i }));
    });

    // The merge prompt replaces the footer
    await waitFor(() => expect(screen.getByRole('alertdialog')).toBeTruthy());
    expect(screen.getByRole('alertdialog').textContent).toContain('already have');
    // First remap call was with merge=false
    expect((api.remapGame as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual(['ug-source', 5000, false]);

    // Confirm merge
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /merge into existing/i }));
    });

    expect((api.remapGame as ReturnType<typeof vi.fn>).mock.calls[1]).toEqual(['ug-source', 5000, true]);
    expect(onRemapped).toHaveBeenCalledWith(merged);
  });

  it('surfaces a server error in the footer alert', async () => {
    (api.igdbSearch as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeResult({ igdbId: 5000, title: 'Slay the Spire' }),
    ]);
    (api.remapGame as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('409 Conflict'));

    render(
      <RemapGameModal
        userGameId="ug-1"
        currentTitle="Slay the Spire 2"
        currentIgdbId={9999}
        onClose={vi.fn()}
        onRemapped={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText('Slay the Spire')).toBeTruthy(), { timeout: 1000 });
    fireEvent.click(screen.getByLabelText('Select Slay the Spire'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^remap$/i }));
    });

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('409 Conflict');
  });
});
