// M3 — NintendoGuidedFlow smoke tests for the desktop 7-step flow.
// Mirrors the EpicGuidedFlow test pattern; key differences:
//   - auth URL is fetched lazily on first reach of step 4 (not on mount).
//   - server returns { url, verifier, state }; verifier is included in
//     the connectNintendo payload.
//   - skip-ahead link on steps 2 and 3 jumps straight to step 4.

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom') as Record<string, unknown>;
  return { ...actual, useNavigate: () => mockNavigate };
});

// QRCode.toDataURL needs a canvas; mock it to a static data URL so the
// step-4 render doesn't break in jsdom.
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,FAKEQR') },
}));

vi.mock('../../../lib/api', async () => {
  const actual = await vi.importActual('../../../lib/api') as Record<string, unknown>;
  return {
    ...actual,
    api: {
      nintendoAuthUrl: vi.fn(),
      connectNintendo: vi.fn(),
    },
  };
});

import { api } from '../../../lib/api';
import { NintendoGuidedFlowDesktop } from '../NintendoGuidedFlowDesktop';

function renderFlow() {
  return render(
    <MemoryRouter initialEntries={['/settings/platforms/nt/connect']}>
      <NintendoGuidedFlowDesktop />
    </MemoryRouter>,
  );
}

function advanceTo(step: number) {
  // Click `next · step N →` until we reach the target.
  for (let n = 2; n <= step; n++) {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`next.*step ${n}( ·|\\b)`, 'i') }));
  }
}

beforeEach(() => {
  mockNavigate.mockReset();
  (api.nintendoAuthUrl as ReturnType<typeof vi.fn>).mockReset();
  (api.connectNintendo as ReturnType<typeof vi.fn>).mockReset();
  // Default: auth URL loads successfully (a "real-shape" PKCE response).
  (api.nintendoAuthUrl as ReturnType<typeof vi.fn>).mockResolvedValue({
    url: 'https://accounts.nintendo.com/connect/1.0.0/authorize?client_id=54789befb391a838&state=ST&response_type=session_token_code&session_token_code_challenge=CH&session_token_code_challenge_method=S256&redirect_uri=npf...://auth&scope=openid',
    verifier: 'V'.repeat(43),
    state: 'ST'.repeat(11),
  });
});

describe('NintendoGuidedFlowDesktop', () => {
  it('does NOT fetch the auth URL until step 4 is first reached (lazy)', async () => {
    renderFlow();
    // Step 1: explainer only. No fetch yet.
    expect(api.nintendoAuthUrl).not.toHaveBeenCalled();
    advanceTo(4);
    await waitFor(() => expect(api.nintendoAuthUrl).toHaveBeenCalledTimes(1));
  });

  it('renders the auth URL as an external link + a QR fallback on step 4', async () => {
    renderFlow();
    advanceTo(4);
    const link = await screen.findByRole('link', { name: /open nintendo sign-in/i }) as HTMLAnchorElement;
    expect(link.href).toMatch(/accounts\.nintendo\.com\/connect\/1\.0\.0\/authorize/);
    expect(link.target).toBe('_blank');
    // QR alt text — fakeQR data URL renders since we mocked qrcode.
    await waitFor(() => expect(screen.getByAltText(/qr code for the nintendo sign-in url/i)).toBeDefined());
  });

  it('surfaces an error panel when the auth URL fetch fails', async () => {
    (api.nintendoAuthUrl as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('500'));
    renderFlow();
    advanceTo(4);
    await waitFor(() => expect(screen.getByText(/failed to load the nintendo auth url/i)).toBeDefined());
  });

  it('skip-ahead link on step 2 jumps directly to step 4 (and triggers the lazy fetch)', async () => {
    renderFlow();
    fireEvent.click(screen.getByRole('button', { name: /next.*step 2/i }));
    fireEvent.click(screen.getByRole('button', { name: /skip ahead.*already paired/i }));
    await waitFor(() => expect(api.nintendoAuthUrl).toHaveBeenCalled());
    // step header should now reflect step 4 — the link is present.
    await screen.findByRole('link', { name: /open nintendo sign-in/i });
  });

  it('advances through 7 steps and posts { redirectUrl, verifier } on save', async () => {
    (api.connectNintendo as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, platformId: 'plat-nt-1' });
    renderFlow();
    advanceTo(6);
    // Wait for the lazy verifier to land so the [save & connect] button enables.
    await waitFor(() => expect(api.nintendoAuthUrl).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/\/\/ paste address-bar url/i), {
      target: { value: 'npf54789befb391a838://auth#session_token_code=eyJhbGc.fresh.payload&state=ST' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save & connect/i }));

    await waitFor(() => expect(api.connectNintendo).toHaveBeenCalledWith({
      redirectUrl: 'npf54789befb391a838://auth#session_token_code=eyJhbGc.fresh.payload&state=ST',
      verifier: 'V'.repeat(43),
    }));
    await waitFor(() => expect(screen.getByText(/nintendo connected!/i)).toBeDefined());
  });

  it('surfaces a friendly error when Nintendo rejects the code (400)', async () => {
    (api.connectNintendo as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('400 — Nintendo rejected'));
    renderFlow();
    advanceTo(6);
    await waitFor(() => expect(api.nintendoAuthUrl).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/\/\/ paste address-bar url/i), {
      target: { value: 'npf://auth#session_token_code=stale.code.value' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save & connect/i }));

    await waitFor(() => expect(screen.getByText(/codes are single-use and expire fast|nintendo rejected/i)).toBeDefined());
    expect(screen.queryByText(/nintendo connected!/i)).toBeNull();
  });
});
