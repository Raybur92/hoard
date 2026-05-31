/**
 * FilterPopover unit tests — replaces B-IGDB-3b1 chip strips with a
 * single-select dropdown per dimension (Andrea 2026-05-31). The contract
 * tested here:
 *
 * - Trigger label reflects current value (`label: any` when null, `label: <value>`)
 * - Clicking the trigger opens the popover with `[any, ...options]`
 * - Clicking an option calls onChange + closes the popover
 * - Clicking "any" passes `null` to onChange
 * - Escape closes without changing the value
 * - Click outside closes without changing the value
 * - Keyboard nav: ArrowDown/ArrowUp move focus; Enter selects
 * - Active selection shows with bullet marker; counts render in faint
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FilterPopover } from '../FilterPopover';

const sampleOptions = [
  { name: 'RPG', count: 31 },
  { name: 'Action', count: 42 },
  { name: 'Strategy', count: 18 },
];

describe('FilterPopover', () => {
  it('renders trigger with "any" label when value is null', () => {
    const onChange = vi.fn();
    render(<FilterPopover label="genre" value={null} options={sampleOptions} onChange={onChange} />);
    expect(screen.getByRole('button', { name: /filter by genre/i })).toBeInTheDocument();
    expect(screen.getByText(/genre: any/i)).toBeInTheDocument();
  });

  it('renders trigger with selected value when value is set', () => {
    const onChange = vi.fn();
    render(<FilterPopover label="genre" value="RPG" options={sampleOptions} onChange={onChange} />);
    expect(screen.getByText(/genre: rpg/i)).toBeInTheDocument();
  });

  it('opens the listbox on trigger click and shows [any, ...options]', () => {
    const onChange = vi.fn();
    render(<FilterPopover label="genre" value={null} options={sampleOptions} onChange={onChange} />);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /filter by genre/i }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    const opts = screen.getAllByRole('option');
    expect(opts).toHaveLength(4); // any + 3 options
    expect(opts[0]).toHaveTextContent(/any/i);
    expect(opts[1]).toHaveTextContent(/rpg/i);
  });

  it('selecting an option calls onChange with the value and closes the listbox', () => {
    const onChange = vi.fn();
    render(<FilterPopover label="genre" value={null} options={sampleOptions} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /filter by genre/i }));
    fireEvent.click(screen.getByTestId('filter-genre-opt-RPG'));
    expect(onChange).toHaveBeenCalledWith('RPG');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('selecting "any" calls onChange(null) — clears the filter', () => {
    const onChange = vi.fn();
    render(<FilterPopover label="genre" value="RPG" options={sampleOptions} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /filter by genre/i }));
    fireEvent.click(screen.getByTestId('filter-genre-opt-any'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('Escape closes without changing the value', () => {
    const onChange = vi.fn();
    render(<FilterPopover label="genre" value={null} options={sampleOptions} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /filter by genre/i }));
    const listbox = screen.getByRole('listbox');
    fireEvent.keyDown(listbox, { key: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('click outside closes the listbox', () => {
    const onChange = vi.fn();
    render(
      <div>
        <FilterPopover label="genre" value={null} options={sampleOptions} onChange={onChange} />
        <div data-testid="outside">outside</div>
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /filter by genre/i }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ArrowDown then Enter selects the next option', () => {
    const onChange = vi.fn();
    render(<FilterPopover label="genre" value={null} options={sampleOptions} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /filter by genre/i }));
    const listbox = screen.getByRole('listbox');
    // Active starts at index 0 (any, since value=null). ArrowDown → 1 (RPG).
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    fireEvent.keyDown(listbox, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('RPG');
  });

  it('shows occurrence counts next to each option', () => {
    const onChange = vi.fn();
    render(<FilterPopover label="genre" value={null} options={sampleOptions} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /filter by genre/i }));
    expect(screen.getByText('(31)')).toBeInTheDocument();
    expect(screen.getByText('(42)')).toBeInTheDocument();
    expect(screen.getByText('(18)')).toBeInTheDocument();
  });

  it('marks the active option with aria-selected="true"', () => {
    const onChange = vi.fn();
    render(<FilterPopover label="genre" value="Action" options={sampleOptions} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /filter by genre/i }));
    const actionOpt = screen.getByTestId('filter-genre-opt-Action');
    expect(actionOpt).toHaveAttribute('aria-selected', 'true');
    const rpgOpt = screen.getByTestId('filter-genre-opt-RPG');
    expect(rpgOpt).toHaveAttribute('aria-selected', 'false');
  });
});
