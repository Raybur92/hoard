import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlatformPicker } from '../PlatformPicker';
import { _resetForTests } from '../../../lib/recentPlatforms';

beforeEach(() => {
  _resetForTests();
});

describe('PlatformPicker', () => {
  describe('collapsed state', () => {
    it('shows "pick a platform…" placeholder when value is null', () => {
      render(<PlatformPicker value={null} onChange={vi.fn()} igdbPlatforms={[]} />);
      expect(screen.getByRole('button', { name: /pick a platform/i })).toBeInTheDocument();
    });

    it('shows the selected platform label when value is set', () => {
      render(<PlatformPicker value="PS5" onChange={vi.fn()} igdbPlatforms={[]} />);
      // The button's accessible name includes the dropdown chevron "▾"
      expect(screen.getByRole('button', { name: /PS5/ })).toBeInTheDocument();
    });

    it('does not expand when disabled', () => {
      render(<PlatformPicker value={null} onChange={vi.fn()} igdbPlatforms={[]} disabled />);
      fireEvent.click(screen.getByRole('button', { name: /pick a platform/i }));
      // No bucket tabs visible — still collapsed
      expect(screen.queryByRole('tab', { name: 'retro' })).not.toBeInTheDocument();
    });
  });

  describe('expanded state', () => {
    function expand(): void {
      fireEvent.click(screen.getByRole('button', { name: /pick a platform/i }));
    }

    it('renders bucket tabs when expanded', () => {
      render(<PlatformPicker value={null} onChange={vi.fn()} igdbPlatforms={[]} />);
      expand();
      expect(screen.getByRole('tab', { name: 'digital' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'physical' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'retro' })).toBeInTheDocument();
    });

    it('pre-opens to the bucket of the first IGDB-reported platform', () => {
      // Pokemon Red — IGDB reports Game Boy first → Retro bucket pre-opens
      render(<PlatformPicker value={null} onChange={vi.fn()} igdbPlatforms={['Game Boy', 'Game Boy Color']} />);
      expand();
      const retroTab = screen.getByRole('tab', { name: 'retro' });
      expect(retroTab).toHaveAttribute('aria-selected', 'true');
    });

    it('defaults to Digital bucket when no IGDB platforms (per OQ-S-2)', () => {
      render(<PlatformPicker value={null} onChange={vi.fn()} igdbPlatforms={[]} />);
      expand();
      const digitalTab = screen.getByRole('tab', { name: 'digital' });
      expect(digitalTab).toHaveAttribute('aria-selected', 'true');
    });

    it('shows "// suggested for this game" section when IGDB platforms match active bucket', () => {
      render(<PlatformPicker value={null} onChange={vi.fn()} igdbPlatforms={['Game Boy', 'Game Boy Color']} />);
      expand();
      expect(screen.getByText(/suggested for this game/i)).toBeInTheDocument();
      // Game Boy should appear in the suggested section
      expect(screen.getAllByRole('option', { name: /Game Boy/ }).length).toBeGreaterThan(0);
    });

    it('shows "// all" section with alphabetical platforms in the active bucket', () => {
      render(<PlatformPicker value={null} onChange={vi.fn()} igdbPlatforms={[]} />);
      expand();
      expect(screen.getByText('// all')).toBeInTheDocument();
      // Digital bucket should have Steam, GOG, etc.
      expect(screen.getByRole('option', { name: /Steam/ })).toBeInTheDocument();
    });

    it('switches buckets when a tab is clicked', () => {
      render(<PlatformPicker value={null} onChange={vi.fn()} igdbPlatforms={[]} />);
      expand();
      // Initially Digital — Steam visible (only Digital option containing "Steam")
      expect(screen.getByRole('option', { name: /Steam/ })).toBeInTheDocument();
      // Switch to Retro
      fireEvent.click(screen.getByRole('tab', { name: 'retro' }));
      expect(screen.getByRole('tab', { name: 'retro' })).toHaveAttribute('aria-selected', 'true');
      // NES should now be visible — exact accessible name "NES NES" (badge + label)
      // because regex /NES/ would also match SNES which is in the same bucket.
      expect(screen.getByRole('option', { name: 'NES NES' })).toBeInTheDocument();
    });

    it('filter input narrows the visible list', () => {
      render(<PlatformPicker value={null} onChange={vi.fn()} igdbPlatforms={[]} />);
      expand();
      const filter = screen.getByLabelText('Filter platforms');
      fireEvent.change(filter, { target: { value: 'gog' } });
      // GOG should match
      expect(screen.getByRole('option', { name: /GOG/ })).toBeInTheDocument();
      // Steam should not
      expect(screen.queryByRole('option', { name: /Steam/ })).not.toBeInTheDocument();
    });

    it('shows "no platforms match" when filter excludes everything in the bucket', () => {
      render(<PlatformPicker value={null} onChange={vi.fn()} igdbPlatforms={[]} />);
      expand();
      const filter = screen.getByLabelText('Filter platforms');
      fireEvent.change(filter, { target: { value: 'zzz-nonexistent-platform-zzz' } });
      expect(screen.getByText(/no platforms match/i)).toBeInTheDocument();
    });
  });

  describe('picking a platform', () => {
    it('calls onChange with the platform label + collapses', () => {
      const onChange = vi.fn();
      render(<PlatformPicker value={null} onChange={onChange} igdbPlatforms={[]} />);
      fireEvent.click(screen.getByRole('button', { name: /pick a platform/i }));
      // Pick Steam from the digital bucket
      fireEvent.click(screen.getByRole('option', { name: /Steam/ }));
      expect(onChange).toHaveBeenCalledWith('Steam');
      // Picker is now collapsed — no bucket tabs
      expect(screen.queryByRole('tab', { name: 'retro' })).not.toBeInTheDocument();
    });
  });

  describe('freeform escape hatch (OQ-F1-8)', () => {
    it('reveals freeform input when "+ other / freeform platform" is tapped', () => {
      render(<PlatformPicker value={null} onChange={vi.fn()} igdbPlatforms={[]} />);
      fireEvent.click(screen.getByRole('button', { name: /pick a platform/i }));
      fireEvent.click(screen.getByRole('button', { name: /other.*freeform platform/i }));
      expect(screen.getByLabelText('Freeform platform name')).toBeInTheDocument();
    });

    it('commits a freeform name via [use this name] button', () => {
      const onChange = vi.fn();
      render(<PlatformPicker value={null} onChange={onChange} igdbPlatforms={[]} />);
      fireEvent.click(screen.getByRole('button', { name: /pick a platform/i }));
      fireEvent.click(screen.getByRole('button', { name: /other.*freeform platform/i }));
      const input = screen.getByLabelText('Freeform platform name');
      fireEvent.change(input, { target: { value: 'Steam Deck' } });
      fireEvent.click(screen.getByRole('button', { name: /use this name/i }));
      expect(onChange).toHaveBeenCalledWith('Steam Deck');
    });

    it('commits a freeform name via Enter key', () => {
      const onChange = vi.fn();
      render(<PlatformPicker value={null} onChange={onChange} igdbPlatforms={[]} />);
      fireEvent.click(screen.getByRole('button', { name: /pick a platform/i }));
      fireEvent.click(screen.getByRole('button', { name: /other.*freeform platform/i }));
      const input = screen.getByLabelText('Freeform platform name');
      fireEvent.change(input, { target: { value: 'PS Classic' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onChange).toHaveBeenCalledWith('PS Classic');
    });

    it('does NOT commit when the freeform value is empty / whitespace', () => {
      const onChange = vi.fn();
      render(<PlatformPicker value={null} onChange={onChange} igdbPlatforms={[]} />);
      fireEvent.click(screen.getByRole('button', { name: /pick a platform/i }));
      fireEvent.click(screen.getByRole('button', { name: /other.*freeform platform/i }));
      const input = screen.getByLabelText('Freeform platform name');
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('Escape cancels freeform input and returns to picker', () => {
      render(<PlatformPicker value={null} onChange={vi.fn()} igdbPlatforms={[]} />);
      fireEvent.click(screen.getByRole('button', { name: /pick a platform/i }));
      fireEvent.click(screen.getByRole('button', { name: /other.*freeform platform/i }));
      const input = screen.getByLabelText('Freeform platform name');
      fireEvent.change(input, { target: { value: 'PS Classic' } });
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(screen.queryByLabelText('Freeform platform name')).not.toBeInTheDocument();
      // The "other / freeform" button should be back
      expect(screen.getByRole('button', { name: /other.*freeform platform/i })).toBeInTheDocument();
    });
  });
});
