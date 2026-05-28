// M2 — EpicGuidedFlow smoke tests for the desktop 5-step flow.
// Mirrors the ItchGuidedFlow test pattern.

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom') as Record<string, unknown>;
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../../lib/api', async () => {
  const actual = await vi.importActual('../../../lib/api') as Record<string, unknown>;
  return {
    ...actual,
    api: {
      epicAuthUrl: vi.fn(),
      connectEpic: vi.fn(),
    },
  };
});

import { api } from '../../../lib/api';
import { EpicGuidedFlowDesktop } from '../EpicGuidedFlowDesktop';

function renderFlow() {
  return render(
    <MemoryRouter initialEntries={['/settings/platforms/ep/connect']}>
      <EpicGuidedFlowDesktop />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockNavigate.mockReset();
  (api.epicAuthUrl as ReturnType<typeof vi.fn>).mockReset();
  (api.connectEpic as ReturnType<typeof vi.fn>).mockReset();
  // Default: auth URL loads successfully.
  (api.epicAuthUrl as ReturnType<typeof vi.fn>).mockResolvedValue({
    url: 'https://www.epicgames.com/id/login?redirectUrl=…',
  });
});

describe('EpicGuidedFlowDesktop', () => {
  it('fetches the Epic auth URL on mount and renders it as an external link on step 1', async () => {
    renderFlow();
    await waitFor(() =>
      expect(api.epicAuthUrl).toHaveBeenCalled(),
    );
    const link = await screen.findByRole('link', { name: /open epic login/i }) as HTMLAnchorElement;
    expect(link.href).toMatch(/^https:\/\/www\.epicgames\.com\/id\/login/);
    expect(link.target).toBe('_blank');
  });

  it('surfaces an error panel when the auth URL fetch fails', async () => {
    (api.epicAuthUrl as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('500'));
    renderFlow();
    await waitFor(() =>
      expect(screen.getByText(/failed to load the epic auth url/i)).toBeDefined(),
    );
  });

  it('advances through steps and exchanges the code on save', async () => {
    (api.connectEpic as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    renderFlow();
    await waitFor(() => expect(api.epicAuthUrl).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /next.*step 2/i }));
    fireEvent.click(screen.getByRole('button', { name: /next.*step 3/i }));
    fireEvent.click(screen.getByRole('button', { name: /next.*step 4/i }));

    // Step 4: paste a JSON blob containing the code.
    fireEvent.change(screen.getByLabelText(/\/\/ paste url, json, or code/i), {
      target: { value: '{"redirectUrl":"https://x","authorizationCode":"epic-code-aBc123"}' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save & connect/i }));

    await waitFor(() => expect(api.connectEpic).toHaveBeenCalledWith('epic-code-aBc123'));
    await waitFor(() => expect(screen.getByText(/epic connected!/i)).toBeDefined());
  });

  it('also extracts the code from a raw URL paste', async () => {
    (api.connectEpic as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    renderFlow();
    await waitFor(() => expect(api.epicAuthUrl).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /next.*step 2/i }));
    fireEvent.click(screen.getByRole('button', { name: /next.*step 3/i }));
    fireEvent.click(screen.getByRole('button', { name: /next.*step 4/i }));

    fireEvent.change(screen.getByLabelText(/\/\/ paste url, json, or code/i), {
      target: { value: 'https://www.epicgames.com/id/api/redirect?authorizationCode=epic-from-url' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save & connect/i }));

    await waitFor(() => expect(api.connectEpic).toHaveBeenCalledWith('epic-from-url'));
  });

  it('surfaces a friendly error when Epic rejects the code', async () => {
    (api.connectEpic as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('400 — Epic rejected'));
    renderFlow();
    await waitFor(() => expect(api.epicAuthUrl).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /next.*step 2/i }));
    fireEvent.click(screen.getByRole('button', { name: /next.*step 3/i }));
    fireEvent.click(screen.getByRole('button', { name: /next.*step 4/i }));
    fireEvent.change(screen.getByLabelText(/\/\/ paste url, json, or code/i), {
      target: { value: 'stale-code' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save & connect/i }));

    await waitFor(() => expect(screen.getByText(/codes are single-use and expire/i)).toBeDefined());
    expect(screen.queryByText(/epic connected!/i)).toBeNull();
  });
});
