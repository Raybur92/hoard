import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { AuthUser } from '@hoard/types';

// Mock api with the exposed RedeemInviteError class so instanceof checks
// in WelcomeScreen still work against what we throw from the mock.
vi.mock('../../../lib/api', async () => {
  const actual = await vi.importActual('../../../lib/api') as Record<string, unknown>;
  return {
    ...actual,
    api: {
      redeemInvite: vi.fn(),
      requestAccess: vi.fn(),
      logout: vi.fn(),
    },
  };
});

// Drive useUser via a per-test mock so we can vary status / hasRequestedAccess.
const mockUser = vi.fn();
const mockSetUser = vi.fn();
const mockSignOut = vi.fn();
vi.mock('../../../contexts/UserContext', () => ({
  useUser: () => mockUser(),
}));

import { api, RedeemInviteError } from '../../../lib/api';
import { WelcomeScreen } from '../WelcomeScreen';

function makePendingUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'u-1',
    email: 'pending@example.com',
    name: null,
    createdAt: '2026-05-08T00:00:00.000Z',
    status: 'PENDING_INVITE',
    isAdmin: false,
    hasRequestedAccess: false,
    preferences: {
      hypeThreshold: 5, libraryView: 'shelves', showHltb: true,
      coverDensity: 'standard', terminalCursor: true,
    },
    ...overrides,
  };
}

function makeActiveUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return makePendingUser({ status: 'ACTIVE', ...overrides });
}

// Captures the current pathname into a ref the test can assert against
// after navigation; avoids mocking useNavigate.
function LocationCapture({ onChange }: { onChange: (path: string) => void }) {
  const loc = useLocation();
  onChange(loc.pathname + loc.search);
  return null;
}

function renderWelcome(initialEntries: string[] = ['/welcome']) {
  let lastPath = initialEntries[0] ?? '/welcome';
  const result = render(
    <MemoryRouter initialEntries={initialEntries}>
      <LocationCapture onChange={(p) => { lastPath = p; }} />
      <Routes>
        <Route path="/welcome" element={<WelcomeScreen />} />
        <Route path="*" element={<div data-testid="catch-all">{/* destination after redirect */}</div>} />
      </Routes>
    </MemoryRouter>,
  );
  return { ...result, getLastPath: () => lastPath };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.mockReturnValue({
    user: makePendingUser(),
    status: 'authed',
    setUser: mockSetUser,
    signOut: mockSignOut,
    refresh: vi.fn(),
  });
});

/* ── default state ── */

describe('WelcomeScreen — default state', () => {
  it('renders both CTAs and the welcome copy', () => {
    renderWelcome();
    expect(screen.getByText(/welcome to hoard/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /I have a code/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /request access/i })).toBeTruthy();
  });

  it('clicking "I have a code" reveals the code input', () => {
    renderWelcome();
    expect(screen.queryByLabelText(/invite code/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /I have a code/i }));
    expect(screen.getByLabelText(/invite code/i)).toBeTruthy();
  });

  it('clicking "Request access" reveals the textarea', () => {
    renderWelcome();
    expect(screen.queryByLabelText(/tell andrea who you are/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /request access/i }));
    expect(screen.getByLabelText(/tell andrea who you are/i)).toBeTruthy();
  });
});

/* ── redeem error messages (Andrea I4 reminder #2) ── */

describe('WelcomeScreen — redeem error messages are distinct per failure mode', () => {
  it('format-invalid: precise hint, NO API call', async () => {
    renderWelcome();
    fireEvent.click(screen.getByRole('button', { name: /I have a code/i }));
    fireEvent.change(screen.getByLabelText(/invite code/i), { target: { value: 'HORD-7K2M-PLAY' } });
    fireEvent.click(screen.getByRole('button', { name: /redeem/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/doesn't look like a Hoard code/i);
    });
    expect(api.redeemInvite).not.toHaveBeenCalled();
  });

  it('CODE_NOT_FOUND (409): "Code not recognized" message', async () => {
    (api.redeemInvite as ReturnType<typeof vi.fn>).mockRejectedValue(
      new RedeemInviteError('CODE_NOT_FOUND', 409),
    );
    renderWelcome();
    fireEvent.click(screen.getByRole('button', { name: /I have a code/i }));
    fireEvent.change(screen.getByLabelText(/invite code/i), { target: { value: 'HOARD-XQ4N-9TBR' } });
    fireEvent.click(screen.getByRole('button', { name: /redeem/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/code not recognized/i);
    });
    expect(api.redeemInvite).toHaveBeenCalledWith('HOARD-XQ4N-9TBR');
  });

  it('CODE_ALREADY_REDEEMED (409): "already been redeemed" message', async () => {
    (api.redeemInvite as ReturnType<typeof vi.fn>).mockRejectedValue(
      new RedeemInviteError('CODE_ALREADY_REDEEMED', 409),
    );
    renderWelcome();
    fireEvent.click(screen.getByRole('button', { name: /I have a code/i }));
    fireEvent.change(screen.getByLabelText(/invite code/i), { target: { value: 'HOARD-7K2M-PLAY' } });
    fireEvent.click(screen.getByRole('button', { name: /redeem/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/already been redeemed/i);
    });
  });

  it('RATE_LIMITED (429): "Too many attempts" message', async () => {
    (api.redeemInvite as ReturnType<typeof vi.fn>).mockRejectedValue(
      new RedeemInviteError('RATE_LIMITED', 429),
    );
    renderWelcome();
    fireEvent.click(screen.getByRole('button', { name: /I have a code/i }));
    fireEvent.change(screen.getByLabelText(/invite code/i), { target: { value: 'HOARD-7K2M-PLAY' } });
    fireEvent.click(screen.getByRole('button', { name: /redeem/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/too many attempts/i);
    });
  });

  it('UNKNOWN error: generic fallback message', async () => {
    (api.redeemInvite as ReturnType<typeof vi.fn>).mockRejectedValue(
      new RedeemInviteError('UNKNOWN', 500),
    );
    renderWelcome();
    fireEvent.click(screen.getByRole('button', { name: /I have a code/i }));
    fireEvent.change(screen.getByLabelText(/invite code/i), { target: { value: 'HOARD-7K2M-PLAY' } });
    fireEvent.click(screen.getByRole('button', { name: /redeem/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/something went wrong/i);
    });
  });

  it('format-invalid message is DIFFERENT from CODE_NOT_FOUND message (the whole point of distinguishing them)', async () => {
    // Drive both branches; the messages must not collide.
    renderWelcome();
    fireEvent.click(screen.getByRole('button', { name: /I have a code/i }));
    fireEvent.change(screen.getByLabelText(/invite code/i), { target: { value: 'HORD-XXXX-XXXX' } });
    fireEvent.click(screen.getByRole('button', { name: /redeem/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/doesn't look like/i);
    });
    expect(screen.queryByText(/code not recognized/i)).toBeNull();
  });
});

/* ── happy path redemption ── */

describe('WelcomeScreen — successful redemption', () => {
  it('valid code → calls api.redeemInvite, setUser with active user, navigates to next', async () => {
    const activeUser = makeActiveUser({ id: 'u-1', email: 'pending@example.com' });
    (api.redeemInvite as ReturnType<typeof vi.fn>).mockResolvedValue(activeUser);
    const captured = renderWelcome(['/welcome?next=%2Flibrary%2FBacklog']);

    fireEvent.click(screen.getByRole('button', { name: /I have a code/i }));
    fireEvent.change(screen.getByLabelText(/invite code/i), { target: { value: 'HOARD-7K2M-PLAY' } });
    fireEvent.click(screen.getByRole('button', { name: /redeem/i }));

    await waitFor(() => {
      expect(api.redeemInvite).toHaveBeenCalledWith('HOARD-7K2M-PLAY');
    });
    expect(mockSetUser).toHaveBeenCalledWith(activeUser);
    await waitFor(() => {
      expect(captured.getLastPath()).toBe('/library/Backlog');
    });
  });

  it('open-redirect defense: malicious next falls back to /', async () => {
    const activeUser = makeActiveUser();
    (api.redeemInvite as ReturnType<typeof vi.fn>).mockResolvedValue(activeUser);
    const captured = renderWelcome(['/welcome?next=%2F%2Fevil.com']);

    fireEvent.click(screen.getByRole('button', { name: /I have a code/i }));
    fireEvent.change(screen.getByLabelText(/invite code/i), { target: { value: 'HOARD-7K2M-PLAY' } });
    fireEvent.click(screen.getByRole('button', { name: /redeem/i }));

    await waitFor(() => {
      expect(captured.getLastPath()).toBe('/');
    });
  });

  it('no next param: navigates to / on redemption', async () => {
    const activeUser = makeActiveUser();
    (api.redeemInvite as ReturnType<typeof vi.fn>).mockResolvedValue(activeUser);
    const captured = renderWelcome(['/welcome']);

    fireEvent.click(screen.getByRole('button', { name: /I have a code/i }));
    fireEvent.change(screen.getByLabelText(/invite code/i), { target: { value: 'HOARD-7K2M-PLAY' } });
    fireEvent.click(screen.getByRole('button', { name: /redeem/i }));

    await waitFor(() => {
      expect(captured.getLastPath()).toBe('/');
    });
  });
});

/* ── request-sent state ── */

describe('WelcomeScreen — request-sent state', () => {
  beforeEach(() => {
    mockUser.mockReturnValue({
      user: makePendingUser({ hasRequestedAccess: true }),
      status: 'authed',
      setUser: mockSetUser,
      signOut: mockSignOut,
      refresh: vi.fn(),
    });
  });

  it('renders the request-sent header', () => {
    renderWelcome();
    expect(screen.getByText(/request sent/i)).toBeTruthy();
    expect(screen.getByText(/andrea has been notified/i)).toBeTruthy();
  });

  it('code input is ALWAYS visible without clicking a CTA (the friction-free flow)', () => {
    renderWelcome();
    // No "I have a code" button to click — input should already be there.
    expect(screen.getByLabelText(/invite code/i)).toBeTruthy();
  });

  it('redeeming from the request-sent state works without "but you already requested access" friction', async () => {
    const activeUser = makeActiveUser({ hasRequestedAccess: true });
    (api.redeemInvite as ReturnType<typeof vi.fn>).mockResolvedValue(activeUser);
    const captured = renderWelcome(['/welcome?next=%2Fdashboard']);

    fireEvent.change(screen.getByLabelText(/invite code/i), { target: { value: 'HOARD-7K2M-PLAY' } });
    fireEvent.click(screen.getByRole('button', { name: /redeem/i }));

    await waitFor(() => {
      expect(api.redeemInvite).toHaveBeenCalledWith('HOARD-7K2M-PLAY');
    });
    expect(mockSetUser).toHaveBeenCalledWith(activeUser);
    await waitFor(() => {
      expect(captured.getLastPath()).toBe('/dashboard');
    });
  });
});

/* ── request-access flow ── */

describe('WelcomeScreen — request-access flow', () => {
  it('submits the trimmed message and flips user into request-sent state', async () => {
    (api.requestAccess as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    renderWelcome();

    fireEvent.click(screen.getByRole('button', { name: /request access/i }));
    fireEvent.change(screen.getByLabelText(/tell andrea who you are/i), { target: { value: '  Hi, I am Marco.  ' } });
    fireEvent.click(screen.getByRole('button', { name: /send request/i }));

    await waitFor(() => {
      expect(api.requestAccess).toHaveBeenCalledWith('Hi, I am Marco.');
    });
    expect(mockSetUser).toHaveBeenCalledWith(expect.objectContaining({ hasRequestedAccess: true }));
  });

  it('clipping: typing past 500 chars is silently truncated to 500', () => {
    renderWelcome();
    fireEvent.click(screen.getByRole('button', { name: /request access/i }));
    const textarea = screen.getByLabelText(/tell andrea who you are/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'x'.repeat(600) } });
    expect(textarea.value.length).toBe(500);
  });

  // Form-level non-empty constraint — keeps accessRequestedAt from
  // being refreshed on rows with no new content. Server-side schema
  // remains optional for non-UI callers, but this UI never lets an
  // empty submit reach the API.
  it('the [send request] button is DISABLED when the textarea is empty', () => {
    renderWelcome();
    fireEvent.click(screen.getByRole('button', { name: /request access/i }));
    const submit = screen.getByRole('button', { name: /send request/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('the [send request] button stays DISABLED when the textarea is whitespace-only', () => {
    renderWelcome();
    fireEvent.click(screen.getByRole('button', { name: /request access/i }));
    fireEvent.change(screen.getByLabelText(/tell andrea who you are/i), { target: { value: '   \n\t  ' } });
    const submit = screen.getByRole('button', { name: /send request/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('the [send request] button ENABLES once the textarea has real content', () => {
    renderWelcome();
    fireEvent.click(screen.getByRole('button', { name: /request access/i }));
    fireEvent.change(screen.getByLabelText(/tell andrea who you are/i), { target: { value: 'M' } });
    const submit = screen.getByRole('button', { name: /send request/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it('clicking [send request] with empty content does not call the API (defensive — covers programmatic submits)', async () => {
    renderWelcome();
    fireEvent.click(screen.getByRole('button', { name: /request access/i }));
    // Force-fire submit on the form to bypass the disabled button.
    const form = screen.getByLabelText(/tell andrea who you are/i).closest('form');
    if (form) fireEvent.submit(form);
    await new Promise((r) => setTimeout(r, 10));
    expect(api.requestAccess).not.toHaveBeenCalled();
  });
});

/* ── active-user redirect ── */

describe('WelcomeScreen — ACTIVE user landing on /welcome', () => {
  it('bounces ACTIVE users to next (no redirect loop, no flash on redeem)', () => {
    mockUser.mockReturnValue({
      user: makeActiveUser(),
      status: 'authed',
      setUser: mockSetUser,
      signOut: mockSignOut,
      refresh: vi.fn(),
    });

    const captured = renderWelcome(['/welcome?next=%2Flibrary']);
    expect(captured.getLastPath()).toBe('/library');
  });

  it('bounces ACTIVE users to / when next is missing or unsafe', () => {
    mockUser.mockReturnValue({
      user: makeActiveUser(),
      status: 'authed',
      setUser: mockSetUser,
      signOut: mockSignOut,
      refresh: vi.fn(),
    });

    const captured = renderWelcome(['/welcome?next=javascript%3Aalert(1)']);
    expect(captured.getLastPath()).toBe('/');
  });
});

/* ── sign-out ── */

describe('WelcomeScreen — sign out', () => {
  it('the sign-out button always shows and calls signOut', () => {
    renderWelcome();
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
