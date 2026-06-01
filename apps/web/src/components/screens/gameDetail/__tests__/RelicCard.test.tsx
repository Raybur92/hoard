/**
 * GD-PR4b — RelicCard structural tests.
 *
 * Pins the 5-layer composition (top band / artwork / lockup / receipt /
 * cartouche) and the 3 sigil row. Editor interactions live in S3/S4
 * patch-route tests (existing GD-PR3 coverage); here we just verify the
 * Card renders all surfaces with the right data threaded through.
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { GameDetailGameInfo, UserGameDetail } from '@hoard/types';
import { RelicCard } from '../RelicCard';
import { UserProvider } from '../../../../contexts/UserContext';

vi.mock('../../../../lib/api', () => ({
  api: {
    me: vi.fn().mockResolvedValue({
      authed: true,
      user: { id: 'u1', email: 'andrea@test', status: 'ACTIVE', isAdmin: false, hasRequestedAccess: false, displayName: null, marketCode: null },
    }),
    patchGame: vi.fn().mockResolvedValue(null),
  },
}));

function wrap(ui: ReactNode) {
  return render(
    <MemoryRouter>
      <UserProvider>{ui}</UserProvider>
    </MemoryRouter>,
  );
}

const sampleGame: GameDetailGameInfo = {
  id: 'g1',
  igdbId: 1877,
  title: 'Cyberpunk 2077',
  developer: 'CD PROJEKT RED',
  releaseYear: 2020,
  releaseDate: '2020-12-10',
  platforms: ['PC', 'PS5'],
  genres: ['Shooter', 'Role-playing (RPG)'],
  themes: ['Action', 'Science fiction'],
  playerPerspectives: ['First person', 'Third person'],
  coverUrl: 'https://images.example.test/cover.jpg',
  heroImageUrl: 'https://images.example.test/hero.jpg',
  synopsis: 'In a dystopian future.',
  category: 0,
  steamAppId: 1091500,
  gogAppId: null,
  psnConceptId: null,
  xboxTitleId: null,
  epicCatalogItemId: null,
  nintendoTitleId: null,
  itchGameId: null,
  hltbId: null,
  releaseDates: [],
  screenshotIds: [],
  videoIds: [],
  relicDitherSvg: '<svg class="relic-dither"><!-- src=https://images.example.test/hero.jpg;fmt=2 --><g class="rd-cell" style="animation-delay:600ms"><circle/></g></svg>',
  sigils: [
    { dimension: 'GENRE',       value: 'COMBAT',       sigilName: 'cross' },
    { dimension: 'THEME',       value: 'CHAOS',        sigilName: 'flame' },
    { dimension: 'PERSPECTIVE', value: 'First person', sigilName: 'ring-dot' },
  ],
};

const sampleUserGame: UserGameDetail = {
  id: 'ug1',
  userId: 'u1',
  gameId: 'g1',
  status: 'Completed',
  subStatus: 'main',
  rating: 8,
  notes: 'phantom liberty fixed it.',
  completionsCount: 1,
  addedAt: '2024-12-01T00:00:00Z',
  updatedAt: '2026-01-22T00:00:00Z',
  lastPlayedAt: '2026-01-22T00:00:00Z',
  playtimeByPlatform: { PS: 91 * 60 },
  hltb: null,
  achievementsByPlatform: {},
  wishlistedPlatforms: [],
  mediaType: null,
  condition: null,
  region: null,
  game: {
    id: sampleGame.id,
    igdbId: sampleGame.igdbId,
    title: sampleGame.title,
    developer: sampleGame.developer,
    releaseYear: sampleGame.releaseYear,
    genres: sampleGame.genres,
    themes: sampleGame.themes,
    playerPerspectives: sampleGame.playerPerspectives,
    coverUrl: sampleGame.coverUrl,
    heroImageUrl: sampleGame.heroImageUrl,
    hltbId: null,
    gogAppId: null,
    psnNpCommunicationId: null,
    hltbData: null,
  } as UserGameDetail['game'],
};

describe('GD-PR4b — RelicCard', () => {
  it('renders all 5 layers (top band, artwork, lockup, receipt, cartouche)', () => {
    wrap(<RelicCard game={sampleGame} userGame={sampleUserGame} onMutated={() => {}} />);
    // 1. Top band — REF / BASE MATERIAL / SEALED + barcode cell
    expect(screen.getByText('REF')).toBeInTheDocument();
    expect(screen.getByText('BASE MATERIAL')).toBeInTheDocument();
    expect(screen.getByText('SEALED')).toBeInTheDocument();
    // 2. Artwork
    expect(screen.getByTestId('relic-artwork')).toBeInTheDocument();
    // 3. Lockup
    expect(screen.getByText('CYBERPUNK 2077')).toBeInTheDocument();
    expect(screen.getByText(/cd projekt red · 2020 · PS/i)).toBeInTheDocument();
    // 4. Receipt rows
    expect(screen.getByText('TOTAL PLAYTIME')).toBeInTheDocument();
    expect(screen.getByText('SUB-STATUS')).toBeInTheDocument();
    expect(screen.getByText('COMPLETIONS')).toBeInTheDocument();
    expect(screen.getByText('RATING')).toBeInTheDocument();
    expect(screen.getByText('NOTE')).toBeInTheDocument();
    // 5. Cartouche
    expect(screen.getByText('HOARD ARCHIVE')).toBeInTheDocument();
    expect(screen.getByText(/IN AETERNVM · MMXXVI/)).toBeInTheDocument();
  });

  it('renders the dithered SVG inline (not the cover fallback) when relicDitherSvg is present', () => {
    const { container } = wrap(<RelicCard game={sampleGame} userGame={sampleUserGame} onMutated={() => {}} />);
    expect(container.querySelector('.relic-dither')).not.toBeNull();
    expect(container.querySelector('.relic-artwork img')).toBeNull();
  });

  it('falls back to cover image when relicDitherSvg is null', () => {
    const game = { ...sampleGame, relicDitherSvg: null };
    const { container } = wrap(<RelicCard game={game} userGame={sampleUserGame} onMutated={() => {}} />);
    expect(container.querySelector('.relic-dither')).toBeNull();
    const img = container.querySelector('.relic-artwork img') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.src).toBe('https://images.example.test/cover.jpg');
  });

  it('renders an empty-state placeholder when both relicDitherSvg + coverUrl are null', () => {
    const game = { ...sampleGame, relicDitherSvg: null, coverUrl: null };
    wrap(<RelicCard game={game} userGame={sampleUserGame} onMutated={() => {}} />);
    expect(screen.getByText('// dither pending')).toBeInTheDocument();
  });

  it('renders exactly 3 sigils with correct dimension labels', () => {
    const { container } = wrap(<RelicCard game={sampleGame} userGame={sampleUserGame} onMutated={() => {}} />);
    const sigils = container.querySelectorAll('.relic-sigil');
    expect(sigils).toHaveLength(3);
    expect(sigils[0]?.getAttribute('aria-label')).toContain('GENRE');
    expect(sigils[1]?.getAttribute('aria-label')).toContain('THEME');
    expect(sigils[2]?.getAttribute('aria-label')).toContain('PERSPECTIVE');
  });

  it('shows total playtime aggregate from playtimeByPlatform', () => {
    wrap(<RelicCard game={sampleGame} userGame={sampleUserGame} onMutated={() => {}} />);
    expect(screen.getByText('91h')).toBeInTheDocument();
  });

  it('cartouche year reads from UserGame.lastPlayedAt (D3 — no completedAt column)', () => {
    wrap(<RelicCard game={sampleGame} userGame={sampleUserGame} onMutated={() => {}} />);
    // 2026 → MMXXVI in Roman numerals
    expect(screen.getByText(/MMXXVI/)).toBeInTheDocument();
  });

  it('falls back to addedAt year when lastPlayedAt is null', () => {
    const ug = { ...sampleUserGame, lastPlayedAt: null };
    wrap(<RelicCard game={sampleGame} userGame={ug} onMutated={() => {}} />);
    // addedAt is 2024 → MMXXIV
    expect(screen.getByText(/MMXXIV/)).toBeInTheDocument();
  });

  it('rating row mounts the inline RatingGrid editor', () => {
    const { container } = wrap(<RelicCard game={sampleGame} userGame={sampleUserGame} onMutated={() => {}} />);
    // RatingGrid renders a role="radiogroup" with 10 role="radio" buttons.
    const radiogroup = container.querySelector('[role="radiogroup"]');
    expect(radiogroup).not.toBeNull();
    expect(radiogroup?.querySelectorAll('[role="radio"]').length).toBe(10);
  });

  describe('readonly mode (GD-PR4b polish)', () => {
    it('hides all inline editors when readonly is true', () => {
      const { container } = wrap(<RelicCard game={sampleGame} userGame={sampleUserGame} readonly />);
      expect(container.querySelector('[role="radiogroup"]')).toBeNull();
      expect(container.querySelector('textarea')).toBeNull();
      expect(container.querySelector('button[aria-label="Edit note"]')).toBeNull();
    });

    it('renders rating as inscribed `8/10` text in amber', () => {
      const { container } = wrap(<RelicCard game={sampleGame} userGame={sampleUserGame} readonly />);
      const rating = container.querySelector('.relic-readonly-rating');
      expect(rating?.textContent).toBe('8/10');
    });

    it('renders sub-status / completions / notes as plain text', () => {
      const { container } = wrap(<RelicCard game={sampleGame} userGame={sampleUserGame} readonly />);
      expect(container.textContent).toContain('main');         // sub-status
      expect(container.textContent).toContain('× 1');          // completions
      expect(container.textContent).toContain('phantom liberty fixed it.'); // note
    });

    it('shows `// no inscription` when notes are empty in readonly mode', () => {
      const ug = { ...sampleUserGame, notes: null };
      wrap(<RelicCard game={sampleGame} userGame={ug} readonly />);
      expect(screen.getByText('// no inscription')).toBeInTheDocument();
    });

    it('renders `—` for missing sub-status / completions / rating in readonly mode', () => {
      const ug = { ...sampleUserGame, subStatus: null, completionsCount: null, rating: null };
      const { container } = wrap(<RelicCard game={sampleGame} userGame={ug} readonly />);
      // 3 `—` dashes in the receipt — one per missing field.
      const dashes = container.querySelectorAll('.relic-readonly-value');
      const dashTexts = Array.from(dashes).map((el) => el.textContent);
      expect(dashTexts.filter((t) => t === '—').length).toBeGreaterThanOrEqual(3);
    });
  });
});
