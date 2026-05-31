// Regression-guard tests for the login/register-then-navigate flow.
//
// The bug these guards exist to prevent: api.login / api.register
// resolves with { user }, but the response is discarded before
// navigate(). UserContext, having loaded /api/auth/me at app mount
// (pre-cookie), still reads status='unauthed' — so navigating to a
// protected route bounces right back to /login. Repeat-register
// attempts then 409 because the first attempt did create the row.
//
// The fix: capture the response, call setUser() with the user BEFORE
// navigate(), and branch the navigation target on user.status:
//   ACTIVE  → safeNext(next) or /
//   PENDING → /welcome, with `next` preserved so post-redemption
//             the user lands where they were trying to go.
//
// Tests cover: ordering (setUser before navigate), navigation target
// per status, safeNext on next param, open-redirect defense, and the
// "register-then-immediately-use" path that surfaced the bug in
// closed-beta smoke tests.

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { AuthUser } from '@hoard/types';

// Mock react-router's useNavigate so we can spy on call order. Keep
// everything else from react-router intact (MemoryRouter, useLocation,
// useSearchParams).
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom') as Record<string, unknown>;
  return { ...actual, useNavigate: () => mockNavigate };
});

// Mock the api so login/register return canned responses we control.
vi.mock('../../../lib/api', async () => {
  const actual = await vi.importActual('../../../lib/api') as Record<string, unknown>;
  return {
    ...actual,
    api: {
      login: vi.fn(),
      register: vi.fn(),
    },
  };
});

// Mock useUser so we can spy on setUser.
const mockSetUser = vi.fn();
vi.mock('../../../contexts/UserContext', () => ({
  useUser: () => ({ setUser: mockSetUser }),
}));

import { api } from '../../../lib/api';
import { LoginScreen } from '../LoginScreen';

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'u-1',
    email: 'someone@example.com',
    name: null,
    createdAt: '2026-05-09T00:00:00.000Z',
    status: 'ACTIVE',
    isAdmin: false,
    hasRequestedAccess: false,
    preferences: {
      hypeThreshold: 5, libraryView: 'shelves', showHltb: true,
      coverDensity: 'standard', terminalCursor: true,
    },
    marketCode: null,
    ...overrides,
  };
}

function renderLogin(initial = '/login') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillAndSubmit(mode: 'login' | 'register'): void {
  if (mode === 'register') {
    fireEvent.click(screen.getByRole('tab', { name: /register/i }));
  }
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'fresh@example.com' } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
  fireEvent.click(
    screen.getByRole('button', { name: mode === 'register' ? /create account/i : /sign in/i }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* ── Ordering guard (the headline regression) ── */

describe('LoginScreen — setUser must fire BEFORE navigate (regression guard)', () => {
  it('register: setUser called before navigate', async () => {
    const pending = makeUser({ status: 'PENDING_INVITE' });
    (api.register as ReturnType<typeof vi.fn>).mockResolvedValue({ user: pending });

    renderLogin();
    fillAndSubmit('register');

    await waitFor(() => expect(api.register).toHaveBeenCalled());
    await waitFor(() => expect(mockSetUser).toHaveBeenCalled());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());

    // Vitest tracks invocation order across all spies. setUser MUST
    // win the race against navigate — otherwise UserContext is stale
    // when RequireAuth checks it on the destination route, and the
    // user bounces back to /login. This is the bug fixed in 386059d
    // and the reason this guard exists.
    const setUserOrder = mockSetUser.mock.invocationCallOrder[0]!;
    const navigateOrder = mockNavigate.mock.invocationCallOrder[0]!;
    expect(setUserOrder).toBeLessThan(navigateOrder);

    // setUser was called with the EXACT user from the response (not a
    // re-fetched / partial / reconstructed shape).
    expect(mockSetUser).toHaveBeenCalledWith(pending);
  });

  it('login: setUser called before navigate', async () => {
    const active = makeUser({ status: 'ACTIVE' });
    (api.login as ReturnType<typeof vi.fn>).mockResolvedValue({ user: active });

    renderLogin();
    fillAndSubmit('login');

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());

    const setUserOrder = mockSetUser.mock.invocationCallOrder[0]!;
    const navigateOrder = mockNavigate.mock.invocationCallOrder[0]!;
    expect(setUserOrder).toBeLessThan(navigateOrder);
    expect(mockSetUser).toHaveBeenCalledWith(active);
  });
});

/* ── Status-aware navigation target ── */

describe('LoginScreen — navigation target branches on user.status', () => {
  it('PENDING_INVITE register → /welcome (no next param)', async () => {
    const pending = makeUser({ status: 'PENDING_INVITE' });
    (api.register as ReturnType<typeof vi.fn>).mockResolvedValue({ user: pending });

    renderLogin();
    fillAndSubmit('register');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/welcome', { replace: true });
    });
  });

  it('PENDING_INVITE register with ?next=/library → /welcome?next=%2Flibrary (preserved)', async () => {
    const pending = makeUser({ status: 'PENDING_INVITE' });
    (api.register as ReturnType<typeof vi.fn>).mockResolvedValue({ user: pending });

    renderLogin('/login?next=%2Flibrary');
    fillAndSubmit('register');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/welcome?next=%2Flibrary', { replace: true });
    });
  });

  it('ACTIVE login with no next → /', async () => {
    const active = makeUser({ status: 'ACTIVE' });
    (api.login as ReturnType<typeof vi.fn>).mockResolvedValue({ user: active });

    renderLogin();
    fillAndSubmit('login');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('ACTIVE login with ?next=/library → /library (deep-link preservation, closes the §3 deferral)', async () => {
    const active = makeUser({ status: 'ACTIVE' });
    (api.login as ReturnType<typeof vi.fn>).mockResolvedValue({ user: active });

    renderLogin('/login?next=%2Flibrary');
    fillAndSubmit('login');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/library', { replace: true });
    });
  });
});

/* ── Open-redirect defense (reuses safeNext) ── */

describe('LoginScreen — open-redirect defense', () => {
  it('ACTIVE login with malicious ?next=//evil.com → / (safeNext fallback)', async () => {
    const active = makeUser({ status: 'ACTIVE' });
    (api.login as ReturnType<typeof vi.fn>).mockResolvedValue({ user: active });

    renderLogin('/login?next=%2F%2Fevil.com');
    fillAndSubmit('login');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('PENDING register with malicious ?next=javascript:alert(1) → /welcome (no next param)', async () => {
    const pending = makeUser({ status: 'PENDING_INVITE' });
    (api.register as ReturnType<typeof vi.fn>).mockResolvedValue({ user: pending });

    renderLogin('/login?next=javascript%3Aalert(1)');
    fillAndSubmit('register');

    await waitFor(() => {
      // safeNext rejects → '/' → since active=false, we land on
      // /welcome with NO next param (since next === '/' would be
      // a dashboard target, not a deep-link target worth preserving).
      expect(mockNavigate).toHaveBeenCalledWith('/welcome', { replace: true });
    });
  });
});

/* ── Failure paths don't navigate ── */

describe('LoginScreen — failure paths', () => {
  it('register rejection: shows error, does NOT call setUser, does NOT navigate', async () => {
    (api.register as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Email already registered'));

    renderLogin();
    fillAndSubmit('register');

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/already registered/i);
    });
    expect(mockSetUser).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('login rejection: shows error, does NOT call setUser, does NOT navigate', async () => {
    (api.login as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Invalid email or password'));

    renderLogin();
    fillAndSubmit('login');

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/invalid/i);
    });
    expect(mockSetUser).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
