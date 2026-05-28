// M1 — ItchGuidedFlow smoke tests for the desktop 4-step flow:
// step 1 (open api keys page) → 2 (generate + copy) → 3 (paste + save)
// → 4 (all set + navigate to /settings/platforms/it).

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// Mock useNavigate so we can spy on the post-save deep-link.
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom') as Record<string, unknown>;
  return { ...actual, useNavigate: () => mockNavigate };
});

// Mock the api directly inside the factory — vitest hoists vi.mock, so
// referencing a top-level const from inside the factory triggers a
// ReferenceError (the closure is evaluated before the const exists).
vi.mock('../../../lib/api', async () => {
  const actual = await vi.importActual('../../../lib/api') as Record<string, unknown>;
  return {
    ...actual,
    api: {
      connectItch: vi.fn(),
    },
  };
});

import { api } from '../../../lib/api';
import { ItchGuidedFlowDesktop } from '../ItchGuidedFlowDesktop';

function renderFlow() {
  return render(
    <MemoryRouter initialEntries={['/settings/platforms/it/connect']}>
      <ItchGuidedFlowDesktop />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockNavigate.mockReset();
  (api.connectItch as ReturnType<typeof vi.fn>).mockReset();
});

describe('ItchGuidedFlowDesktop', () => {
  it('renders step 1 with an external link to the itch.io api keys page', () => {
    renderFlow();
    const link = screen.getByRole('link', { name: /open itch\.io api keys/i }) as HTMLAnchorElement;
    expect(link.href).toBe('https://itch.io/user/settings/api-keys');
    expect(link.target).toBe('_blank');
  });

  it('advances through steps 1 → 2 → 3 → save → 4 on a happy path', async () => {
    (api.connectItch as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    renderFlow();

    fireEvent.click(screen.getByRole('button', { name: /next.*step 2/i }));
    // Step 2 body shows the unique "your api keys" illustration text.
    expect(screen.getByText(/your api keys/i)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /next.*step 3/i }));
    expect(screen.getByLabelText(/\/\/ paste api key/i)).toBeDefined();

    fireEvent.change(screen.getByLabelText(/\/\/ paste api key/i), {
      target: { value: 'a-real-looking-itch-key-with-enough-chars' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save & connect/i }));

    await waitFor(() => expect(api.connectItch).toHaveBeenCalledWith('a-real-looking-itch-key-with-enough-chars'));
    await waitFor(() => expect(screen.getByText(/itch\.io connected!/i)).toBeDefined());
  });

  it('surfaces a friendly error when itch.io rejects the key (400)', async () => {
    (api.connectItch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('400 — itch.io rejected the API key'));
    renderFlow();

    fireEvent.click(screen.getByRole('button', { name: /next.*step 2/i }));
    fireEvent.click(screen.getByRole('button', { name: /next.*step 3/i }));

    fireEvent.change(screen.getByLabelText(/\/\/ paste api key/i), {
      target: { value: 'rejected-key-with-enough-chars' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save & connect/i }));

    await waitFor(() => expect(screen.getByText(/itch\.io rejected the key/i)).toBeDefined());
    expect(screen.queryByText(/itch\.io connected!/i)).toBeNull();
  });

  it('navigates to /settings/platforms/it from the final step', async () => {
    (api.connectItch as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    renderFlow();

    fireEvent.click(screen.getByRole('button', { name: /next.*step 2/i }));
    fireEvent.click(screen.getByRole('button', { name: /next.*step 3/i }));
    fireEvent.change(screen.getByLabelText(/\/\/ paste api key/i), {
      target: { value: 'a-real-looking-itch-key-with-enough-chars' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save & connect/i }));
    await waitFor(() => expect(api.connectItch).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/settings/platforms/it');
  });

  it('disables the save button until the input has ≥10 chars', () => {
    renderFlow();
    fireEvent.click(screen.getByRole('button', { name: /next.*step 2/i }));
    fireEvent.click(screen.getByRole('button', { name: /next.*step 3/i }));

    const saveBtn = screen.getByRole('button', { name: /save & connect/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/\/\/ paste api key/i), {
      target: { value: 'short' },
    });
    expect(saveBtn.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/\/\/ paste api key/i), {
      target: { value: 'now-enough-chars' },
    });
    expect(saveBtn.disabled).toBe(false);
  });
});
