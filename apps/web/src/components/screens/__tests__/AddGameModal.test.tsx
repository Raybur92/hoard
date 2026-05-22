import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IgdbSearchResult } from '@hoard/types';
import { AddGameModal } from '../AddGameModal';
import { _resetForTests } from '../../../lib/recentPlatforms';

vi.mock('../../../lib/api', () => ({
  api: {
    igdbSearch: vi.fn(),
    addManualGame: vi.fn(),
  },
}));

import { api } from '../../../lib/api';

function makeResult(overrides: Partial<IgdbSearchResult> = {}): IgdbSearchResult {
  return {
    igdbId: 100,
    title: 'Pokémon Red',
    developer: 'Game Freak',
    releaseYear: 1996,
    genres: ['RPG'],
    coverUrl: null,
    platforms: ['Game Boy'],
    totalRatingCount: 1000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetForTests();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

async function pickFirstResult(): Promise<void> {
  const search = screen.getByLabelText('Search IGDB by title');
  fireEvent.change(search, { target: { value: 'Pokemon Red' } });
  // Advance the debounce
  await act(async () => { vi.advanceTimersByTime(500); });
  // Wait for the result to render
  await waitFor(() => expect(screen.getByText('Pokémon Red')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('option', { name: /Pokémon Red/ }));
}

describe('AddGameModal', () => {
  describe('initial render', () => {
    it('renders the modal with header', () => {
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      expect(screen.getByRole('dialog', { name: /add game/i })).toBeInTheDocument();
    });

    it('focuses the search input on mount', () => {
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      expect(screen.getByLabelText('Search IGDB by title')).toHaveFocus();
    });

    it('does not show the status chip strip before a game is selected', () => {
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      expect(screen.queryByRole('radiogroup', { name: 'Status' })).not.toBeInTheDocument();
    });
  });

  describe('search → results → select', () => {
    it('shows search results after debounced query', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      const search = screen.getByLabelText('Search IGDB by title');
      fireEvent.change(search, { target: { value: 'Pokemon Red' } });
      await act(async () => { vi.advanceTimersByTime(500); });
      await waitFor(() => expect(screen.getByText('Pokémon Red')).toBeInTheDocument());
    });

    it('shows status chip strip + platform picker + footer after selecting a result', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      await pickFirstResult();
      expect(screen.getByRole('radiogroup', { name: 'Status' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /pick a platform/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add to library/i })).toBeInTheDocument();
    });

    it('[pick different] returns to the search view', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      await pickFirstResult();
      fireEvent.click(screen.getByRole('button', { name: /pick a different game/i }));
      // Status chip strip should be gone
      expect(screen.queryByRole('radiogroup', { name: 'Status' })).not.toBeInTheDocument();
    });
  });

  describe('entry intent threading', () => {
    it('default status = Backlog when intent="own"', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} intent="own" />);
      await pickFirstResult();
      const backlog = screen.getByRole('radio', { name: 'Backlog' });
      expect(backlog).toHaveAttribute('aria-checked', 'true');
    });

    it('default status = Wishlist when intent="wishlist"', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} intent="wishlist" />);
      await pickFirstResult();
      const wishlist = screen.getByRole('radio', { name: 'Wishlist' });
      expect(wishlist).toHaveAttribute('aria-checked', 'true');
    });

    it('save CTA reads "+ add to library" when intent="own"', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} intent="own" />);
      await pickFirstResult();
      expect(screen.getByRole('button', { name: /add to library/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /add to wishlist/i })).not.toBeInTheDocument();
    });

    it('save CTA reads "+ add to wishlist" when intent="wishlist"', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} intent="wishlist" />);
      await pickFirstResult();
      expect(screen.getByRole('button', { name: /add to wishlist/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /add to library/i })).not.toBeInTheDocument();
    });
  });

  describe('save → post-success (P5 pattern b)', () => {
    it('save with valid fields transitions to the success summary', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      (api.addManualGame as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      const onAdded = vi.fn();
      render(<AddGameModal onClose={vi.fn()} onAdded={onAdded} />);
      await pickFirstResult();
      // Pick a platform — open the picker and pick Game Boy (IGDB-suggested)
      fireEvent.click(screen.getByRole('button', { name: /pick a platform/i }));
      fireEvent.click(screen.getAllByRole('option', { name: /Game Boy/ })[0]!);
      // Click save
      fireEvent.click(screen.getByRole('button', { name: /add to library/i }));
      await waitFor(() => expect(api.addManualGame).toHaveBeenCalledTimes(1));
      // Should now show the summary
      await waitFor(() => expect(screen.getByText(/added/i)).toBeInTheDocument());
      expect(onAdded).toHaveBeenCalledTimes(1);
    });

    it('[+ add another] resets selection but preserves platform pin', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      (api.addManualGame as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      await pickFirstResult();
      fireEvent.click(screen.getByRole('button', { name: /pick a platform/i }));
      fireEvent.click(screen.getAllByRole('option', { name: /Game Boy/ })[0]!);
      fireEvent.click(screen.getByRole('button', { name: /add to library/i }));
      await waitFor(() => expect(screen.getByText(/added/i)).toBeInTheDocument());
      // Tap [+ add another]
      fireEvent.click(screen.getByRole('button', { name: /add another/i }));
      // Back to P1 with pinned indicator visible
      await waitFor(() => expect(screen.getByText(/pinned: Game Boy/i)).toBeInTheDocument());
      // Status chip strip is NOT yet visible — no game selected
      expect(screen.queryByRole('radiogroup', { name: 'Status' })).not.toBeInTheDocument();
    });

    it('[× unpin] removes the platform pin', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      (api.addManualGame as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      await pickFirstResult();
      fireEvent.click(screen.getByRole('button', { name: /pick a platform/i }));
      fireEvent.click(screen.getAllByRole('option', { name: /Game Boy/ })[0]!);
      fireEvent.click(screen.getByRole('button', { name: /add to library/i }));
      await waitFor(() => expect(screen.getByText(/added/i)).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: /add another/i }));
      await waitFor(() => expect(screen.getByText(/pinned: Game Boy/i)).toBeInTheDocument());
      // Tap [× unpin]
      fireEvent.click(screen.getByRole('button', { name: /unpin platform/i }));
      expect(screen.queryByText(/pinned:/i)).not.toBeInTheDocument();
    });
  });

  describe('cancel + error paths', () => {
    it('cancel button calls onClose', () => {
      const onClose = vi.fn();
      render(<AddGameModal onClose={onClose} onAdded={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
      expect(onClose).toHaveBeenCalled();
    });

    it('shows IGDB-unreachable marker when igdbSearch rejects', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      const search = screen.getByLabelText('Search IGDB by title');
      fireEvent.change(search, { target: { value: 'something' } });
      await act(async () => { vi.advanceTimersByTime(500); });
      await waitFor(() => expect(screen.getByText(/IGDB unreachable/i)).toBeInTheDocument());
    });

    it('shows save error inline when addManualGame rejects', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      (api.addManualGame as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('duplicate'));
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      await pickFirstResult();
      fireEvent.click(screen.getByRole('button', { name: /pick a platform/i }));
      fireEvent.click(screen.getAllByRole('option', { name: /Game Boy/ })[0]!);
      fireEvent.click(screen.getByRole('button', { name: /add to library/i }));
      await waitFor(() => expect(screen.getByText(/duplicate/i)).toBeInTheDocument());
      // Modal stays in P2 — no success summary
      expect(screen.queryByText(/^\/\/ added/)).not.toBeInTheDocument();
    });
  });
});
