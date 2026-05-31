/**
 * B-IGDB-3b2 — ChangeLensPopover unit tests.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChangeLensPopover } from '../ChangeLensPopover';

describe('ChangeLensPopover', () => {
  const allOptions = [
    { type: 'status' as const, label: 'status' },
    { type: 'genre' as const, label: 'genre' },
    { type: 'theme' as const, label: 'theme' },
    { type: 'perspective' as const, label: 'perspective' },
  ];

  it('renders the trigger button labelled "change lens"', () => {
    render(<ChangeLensPopover current="status" options={allOptions} onPick={vi.fn()} />);
    expect(screen.getByRole('button', { name: /change primary lens/i })).toBeInTheDocument();
    expect(screen.getByText(/change lens/i)).toBeInTheDocument();
  });

  it('opens the listbox on click', () => {
    render(<ChangeLensPopover current="status" options={allOptions} onPick={vi.fn()} />);
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /change primary lens/i }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('marks the current lens as aria-selected + aria-disabled', () => {
    render(<ChangeLensPopover current="status" options={allOptions} onPick={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /change primary lens/i }));
    const statusOpt = screen.getByTestId('change-lens-opt-status');
    expect(statusOpt).toHaveAttribute('aria-selected', 'true');
    expect(statusOpt).toHaveAttribute('aria-disabled', 'true');
  });

  it('disabled options do not call onPick', () => {
    const onPick = vi.fn();
    const opts = allOptions.map((o) => ({ ...o, disabled: o.type !== 'genre' }));
    render(<ChangeLensPopover current="status" options={opts} onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: /change primary lens/i }));
    fireEvent.click(screen.getByTestId('change-lens-opt-theme'));
    expect(onPick).not.toHaveBeenCalled();
  });

  it('clicking an enabled non-current option calls onPick', () => {
    const onPick = vi.fn();
    const opts = allOptions.map((o) => ({ ...o, disabled: false }));
    render(<ChangeLensPopover current="status" options={opts} onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: /change primary lens/i }));
    fireEvent.click(screen.getByTestId('change-lens-opt-genre'));
    expect(onPick).toHaveBeenCalledWith('genre');
  });

  it('Escape closes without picking', () => {
    const onPick = vi.fn();
    render(<ChangeLensPopover current="status" options={allOptions} onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: /change primary lens/i }));
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
