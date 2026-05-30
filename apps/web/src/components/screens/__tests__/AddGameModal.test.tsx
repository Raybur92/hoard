import { render as rtlRender, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { IgdbSearchResult } from '@hoard/types';
import { AddGameModal } from '../AddGameModal';
import { _resetForTests } from '../../../lib/recentPlatforms';

// F1-PR6 — AddGameModal now uses useNavigate for the P5 deep-links, so
// every render needs a Router context. Wrap rtl's render so existing
// callsites don't need updating. A LocationProbe is mounted under the
// router so tests can read window-style location.pathname/search via
// `screen.getByTestId('location')` for the deep-link assertions.
function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location" data-path={loc.pathname} data-search={loc.search} />;
}
function render(ui: React.ReactElement, opts?: { initialEntries?: string[] }) {
  return rtlRender(
    <MemoryRouter initialEntries={opts?.initialEntries ?? ['/library']}>
      <Routes>
        <Route path="*" element={<>{ui}<LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

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
    themes: [],
    playerPerspectives: [],
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

  describe('F1-PR2 collector metadata pickers', () => {
    it('renders the media-type chip strip once a game is selected', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      await pickFirstResult();
      expect(screen.getByRole('radiogroup', { name: 'Media type' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'digital' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'physical' })).toBeInTheDocument();
    });

    it('does NOT render condition / region strips by default (no mediaType picked)', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      await pickFirstResult();
      expect(screen.queryByRole('radiogroup', { name: 'Condition' })).not.toBeInTheDocument();
      expect(screen.queryByRole('radiogroup', { name: 'Region' })).not.toBeInTheDocument();
    });

    it('does NOT render condition / region strips when mediaType = DIGITAL', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      await pickFirstResult();
      fireEvent.click(screen.getByRole('radio', { name: 'digital' }));
      expect(screen.queryByRole('radiogroup', { name: 'Condition' })).not.toBeInTheDocument();
      expect(screen.queryByRole('radiogroup', { name: 'Region' })).not.toBeInTheDocument();
    });

    it('reveals condition + region strips when mediaType = PHYSICAL', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      await pickFirstResult();
      fireEvent.click(screen.getByRole('radio', { name: 'physical' }));
      expect(screen.getByRole('radiogroup', { name: 'Condition' })).toBeInTheDocument();
      expect(screen.getByRole('radiogroup', { name: 'Region' })).toBeInTheDocument();
      // Spot-check all five condition + four region values are rendered
      expect(screen.getByRole('radio', { name: 'loose' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'CIB' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'sealed' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'replica' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'graded' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'NTSC-U' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'NTSC-J' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'PAL' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'other' })).toBeInTheDocument();
    });

    it('switching PHYSICAL → DIGITAL hides + clears condition + region', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      (api.addManualGame as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      await pickFirstResult();
      fireEvent.click(screen.getByRole('radio', { name: 'physical' }));
      fireEvent.click(screen.getByRole('radio', { name: 'CIB' }));
      fireEvent.click(screen.getByRole('radio', { name: 'PAL' }));
      // Now switch to DIGITAL — strips disappear
      fireEvent.click(screen.getByRole('radio', { name: 'digital' }));
      expect(screen.queryByRole('radiogroup', { name: 'Condition' })).not.toBeInTheDocument();
      expect(screen.queryByRole('radiogroup', { name: 'Region' })).not.toBeInTheDocument();
      // Pick a platform + save → addManualGame must NOT carry condition/region
      fireEvent.click(screen.getByRole('button', { name: /pick a platform/i }));
      fireEvent.click(screen.getAllByRole('option', { name: /Game Boy/ })[0]!);
      fireEvent.click(screen.getByRole('button', { name: /add to library/i }));
      await waitFor(() => expect(api.addManualGame).toHaveBeenCalledTimes(1));
      const body = (api.addManualGame as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(body.mediaType).toBe('DIGITAL');
      expect(body).not.toHaveProperty('condition');
      expect(body).not.toHaveProperty('region');
    });

    it('clicking an already-active chip toggles it off (mediaType, condition, region)', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      await pickFirstResult();
      // PHYSICAL → toggle off → strips disappear
      fireEvent.click(screen.getByRole('radio', { name: 'physical' }));
      expect(screen.getByRole('radio', { name: 'physical' })).toHaveAttribute('aria-checked', 'true');
      fireEvent.click(screen.getByRole('radio', { name: 'physical' }));
      expect(screen.getByRole('radio', { name: 'physical' })).toHaveAttribute('aria-checked', 'false');
      expect(screen.queryByRole('radiogroup', { name: 'Condition' })).not.toBeInTheDocument();
      // Re-arm PHYSICAL and toggle condition + region
      fireEvent.click(screen.getByRole('radio', { name: 'physical' }));
      fireEvent.click(screen.getByRole('radio', { name: 'sealed' }));
      expect(screen.getByRole('radio', { name: 'sealed' })).toHaveAttribute('aria-checked', 'true');
      fireEvent.click(screen.getByRole('radio', { name: 'sealed' }));
      expect(screen.getByRole('radio', { name: 'sealed' })).toHaveAttribute('aria-checked', 'false');
    });

    it('save body includes mediaType + condition + region when PHYSICAL is fully filled', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      (api.addManualGame as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      await pickFirstResult();
      fireEvent.click(screen.getByRole('radio', { name: 'physical' }));
      fireEvent.click(screen.getByRole('radio', { name: 'CIB' }));
      fireEvent.click(screen.getByRole('radio', { name: 'NTSC-J' }));
      fireEvent.click(screen.getByRole('button', { name: /pick a platform/i }));
      fireEvent.click(screen.getAllByRole('option', { name: /Game Boy/ })[0]!);
      fireEvent.click(screen.getByRole('button', { name: /add to library/i }));
      await waitFor(() => expect(api.addManualGame).toHaveBeenCalledTimes(1));
      const body = (api.addManualGame as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(body.mediaType).toBe('PHYSICAL');
      expect(body.condition).toBe('CIB');
      expect(body.region).toBe('NTSC_J');
    });

    it('omits collector fields entirely when no mediaType is picked', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      (api.addManualGame as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      await pickFirstResult();
      // Skip mediaType — go straight to save
      fireEvent.click(screen.getByRole('button', { name: /pick a platform/i }));
      fireEvent.click(screen.getAllByRole('option', { name: /Game Boy/ })[0]!);
      fireEvent.click(screen.getByRole('button', { name: /add to library/i }));
      await waitFor(() => expect(api.addManualGame).toHaveBeenCalledTimes(1));
      const body = (api.addManualGame as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(body).not.toHaveProperty('mediaType');
      expect(body).not.toHaveProperty('condition');
      expect(body).not.toHaveProperty('region');
    });

    it('[+ add another] resets mediaType/condition/region (preserves only platform pin)', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      (api.addManualGame as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      await pickFirstResult();
      fireEvent.click(screen.getByRole('radio', { name: 'physical' }));
      fireEvent.click(screen.getByRole('radio', { name: 'sealed' }));
      fireEvent.click(screen.getByRole('radio', { name: 'PAL' }));
      fireEvent.click(screen.getByRole('button', { name: /pick a platform/i }));
      fireEvent.click(screen.getAllByRole('option', { name: /Game Boy/ })[0]!);
      fireEvent.click(screen.getByRole('button', { name: /add to library/i }));
      await waitFor(() => expect(screen.getByText(/added/i)).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: /add another/i }));
      // Pin survives
      await waitFor(() => expect(screen.getByText(/pinned: Game Boy/i)).toBeInTheDocument());
      // Pick a new game; mediaType must be back to "unset"
      await pickFirstResult();
      expect(screen.getByRole('radio', { name: 'physical' })).toHaveAttribute('aria-checked', 'false');
      expect(screen.getByRole('radio', { name: 'digital' })).toHaveAttribute('aria-checked', 'false');
      // condition + region not visible (no mediaType armed)
      expect(screen.queryByRole('radiogroup', { name: 'Condition' })).not.toBeInTheDocument();
      expect(screen.queryByRole('radiogroup', { name: 'Region' })).not.toBeInTheDocument();
    });
  });

  describe('F1-PR3 [+ more details] panel + manual playtime', () => {
    async function pickPlatform(): Promise<void> {
      fireEvent.click(screen.getByRole('button', { name: /pick a platform/i }));
      fireEvent.click(screen.getAllByRole('option', { name: /Game Boy/ })[0]!);
    }

    it('renders the [+ more details] toggle once a game is selected, panel collapsed by default', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      await pickFirstResult();
      const toggle = screen.getByRole('button', { name: /more details/i });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByLabelText('Hours played')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Minutes played')).not.toBeInTheDocument();
    });

    it('reveals hours + minutes inputs and the times-beaten placeholder when expanded', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      await pickFirstResult();
      fireEvent.click(screen.getByRole('button', { name: /more details/i }));
      expect(screen.getByLabelText('Hours played')).toBeInTheDocument();
      expect(screen.getByLabelText('Minutes played')).toBeInTheDocument();
      // Architectural slot for times-beaten is rendered as muted copy only
      expect(screen.getByText(/coming soon · v2/i)).toBeInTheDocument();
    });

    it('toggle is idempotent — re-clicking collapses the panel + retains drafts', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      await pickFirstResult();
      const toggle = screen.getByRole('button', { name: /more details/i });
      fireEvent.click(toggle);
      fireEvent.change(screen.getByLabelText('Hours played'), { target: { value: '5' } });
      fireEvent.click(toggle);
      expect(screen.queryByLabelText('Hours played')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /more details/i }));
      // Draft preserved across collapse/expand
      expect(screen.getByLabelText('Hours played')).toHaveValue(5);
    });

    it('omits manualPlaytimeMinutes from the body when both inputs are empty', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      (api.addManualGame as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      await pickFirstResult();
      // Expand panel but leave both inputs blank
      fireEvent.click(screen.getByRole('button', { name: /more details/i }));
      await pickPlatform();
      fireEvent.click(screen.getByRole('button', { name: /add to library/i }));
      await waitFor(() => expect(api.addManualGame).toHaveBeenCalledTimes(1));
      const body = (api.addManualGame as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(body).not.toHaveProperty('manualPlaytimeMinutes');
    });

    it('sends manualPlaytimeMinutes = hours*60 + minutes when either input is non-empty', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      (api.addManualGame as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      await pickFirstResult();
      fireEvent.click(screen.getByRole('button', { name: /more details/i }));
      fireEvent.change(screen.getByLabelText('Hours played'), { target: { value: '30' } });
      fireEvent.change(screen.getByLabelText('Minutes played'), { target: { value: '30' } });
      await pickPlatform();
      fireEvent.click(screen.getByRole('button', { name: /add to library/i }));
      await waitFor(() => expect(api.addManualGame).toHaveBeenCalledTimes(1));
      const body = (api.addManualGame as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(body.manualPlaytimeMinutes).toBe(30 * 60 + 30);
    });

    it('treats empty as 0 when the other input is filled (hours-only)', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      (api.addManualGame as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      await pickFirstResult();
      fireEvent.click(screen.getByRole('button', { name: /more details/i }));
      fireEvent.change(screen.getByLabelText('Hours played'), { target: { value: '12' } });
      await pickPlatform();
      fireEvent.click(screen.getByRole('button', { name: /add to library/i }));
      await waitFor(() => expect(api.addManualGame).toHaveBeenCalledTimes(1));
      const body = (api.addManualGame as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(body.manualPlaytimeMinutes).toBe(720);
    });

    it('clamps negative and non-numeric inputs to 0 (UI safety net — backend rejects raw negatives)', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      (api.addManualGame as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      await pickFirstResult();
      fireEvent.click(screen.getByRole('button', { name: /more details/i }));
      // input type="number" usually blocks "abc" but defensive code handles it; set via change event directly
      fireEvent.change(screen.getByLabelText('Hours played'), { target: { value: '-5' } });
      fireEvent.change(screen.getByLabelText('Minutes played'), { target: { value: '15' } });
      await pickPlatform();
      fireEvent.click(screen.getByRole('button', { name: /add to library/i }));
      await waitFor(() => expect(api.addManualGame).toHaveBeenCalledTimes(1));
      const body = (api.addManualGame as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      // Hours clamped to 0, minutes passes through
      expect(body.manualPlaytimeMinutes).toBe(15);
    });

    it('[+ add another] collapses the panel and clears playtime drafts', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      (api.addManualGame as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      await pickFirstResult();
      fireEvent.click(screen.getByRole('button', { name: /more details/i }));
      fireEvent.change(screen.getByLabelText('Hours played'), { target: { value: '10' } });
      await pickPlatform();
      fireEvent.click(screen.getByRole('button', { name: /add to library/i }));
      await waitFor(() => expect(screen.getByText(/added/i)).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: /add another/i }));
      // Pick a new game; panel collapsed + drafts cleared
      await pickFirstResult();
      const toggle = screen.getByRole('button', { name: /more details/i });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(toggle);
      expect(screen.getByLabelText('Hours played')).toHaveValue(null);
      expect(screen.getByLabelText('Minutes played')).toHaveValue(null);
    });
  });

  describe('F1-PR6 P5 deep-links — [view game] + [+ rate / note]', () => {
    // Mocked UserGameDetail shape — enough surface for the modal's
    // setSuccessPayload to read `response.id`.
    function mockResponse(id: string) {
      return { id, gameId: 'game-x', title: 'Pokémon Red' };
    }

    it('does NOT render the deep-link CTAs when the response lacks an id', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      // Legacy / null-response shape — defensive guard fires.
      (api.addManualGame as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      await pickFirstResult();
      fireEvent.click(screen.getByRole('button', { name: /pick a platform/i }));
      fireEvent.click(screen.getAllByRole('option', { name: /Game Boy/ })[0]!);
      fireEvent.click(screen.getByRole('button', { name: /add to library/i }));
      await waitFor(() => expect(screen.getByText(/added/i)).toBeInTheDocument());
      // The two F1-PR6 CTAs must NOT render — keeps the success screen
      // intact for legacy / regression-edge cases without showing broken
      // "navigates nowhere" links.
      expect(screen.queryByRole('button', { name: /^view game$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /\+ rate \/ note/i })).not.toBeInTheDocument();
    });

    it('renders [view game] + [+ rate / note] once the response carries a userGameId', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      (api.addManualGame as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse('ug-pr6-1'));
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} />);
      await pickFirstResult();
      fireEvent.click(screen.getByRole('button', { name: /pick a platform/i }));
      fireEvent.click(screen.getAllByRole('option', { name: /Game Boy/ })[0]!);
      fireEvent.click(screen.getByRole('button', { name: /add to library/i }));
      await waitFor(() => expect(screen.getByText(/added/i)).toBeInTheDocument());
      expect(screen.getByRole('button', { name: /^view game$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /\+ rate \/ note/i })).toBeInTheDocument();
    });

    it('[view game] navigates to /game/:id and closes the modal', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      (api.addManualGame as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse('ug-pr6-2'));
      const onClose = vi.fn();
      render(<AddGameModal onClose={onClose} onAdded={vi.fn()} />);
      await pickFirstResult();
      fireEvent.click(screen.getByRole('button', { name: /pick a platform/i }));
      fireEvent.click(screen.getAllByRole('option', { name: /Game Boy/ })[0]!);
      fireEvent.click(screen.getByRole('button', { name: /add to library/i }));
      await waitFor(() => expect(screen.getByRole('button', { name: /^view game$/i })).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: /^view game$/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
      // Probe reads the router's location after navigation.
      expect(screen.getByTestId('location').getAttribute('data-path')).toBe('/game/ug-pr6-2');
      expect(screen.getByTestId('location').getAttribute('data-search')).toBe('');
    });

    it('[+ rate / note] navigates to /game/:id?focus=notes and closes the modal', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      (api.addManualGame as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse('ug-pr6-3'));
      const onClose = vi.fn();
      render(<AddGameModal onClose={onClose} onAdded={vi.fn()} />);
      await pickFirstResult();
      fireEvent.click(screen.getByRole('button', { name: /pick a platform/i }));
      fireEvent.click(screen.getAllByRole('option', { name: /Game Boy/ })[0]!);
      fireEvent.click(screen.getByRole('button', { name: /add to library/i }));
      await waitFor(() => expect(screen.getByRole('button', { name: /\+ rate \/ note/i })).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: /\+ rate \/ note/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('location').getAttribute('data-path')).toBe('/game/ug-pr6-3');
      // ?focus=notes is the post-8 PR A pattern that auto-opens the notes
      // editor on land (GameDetailDesktop.tsx:45 + GameDetailMobile.tsx:56).
      expect(screen.getByTestId('location').getAttribute('data-search')).toBe('?focus=notes');
    });

    it('deep-links render in both own and wishlist intents (notes are useful for wishlist too)', async () => {
      (api.igdbSearch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([makeResult()]);
      (api.addManualGame as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse('ug-pr6-4'));
      render(<AddGameModal onClose={vi.fn()} onAdded={vi.fn()} intent="wishlist" />);
      await pickFirstResult();
      fireEvent.click(screen.getByRole('button', { name: /pick a platform/i }));
      fireEvent.click(screen.getAllByRole('option', { name: /Game Boy/ })[0]!);
      fireEvent.click(screen.getByRole('button', { name: /add to wishlist/i }));
      await waitFor(() => expect(screen.getByText(/added to wishlist/i)).toBeInTheDocument());
      expect(screen.getByRole('button', { name: /^view game$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /\+ rate \/ note/i })).toBeInTheDocument();
    });

  });
});
