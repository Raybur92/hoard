/**
 * Integration test for deep-link preservation across the unauth →
 * login → destination flow.
 *
 * This is the test that would have caught the bug Andrea hit on
 * smoke-test #3 (commit 5024234 claimed to close the §4 deferral but
 * deep-link prod behavior said otherwise). The unit tests in
 * LoginScreen.test.tsx pass because they explicitly seed `?next=` in
 * the test URL — but production cold deep-links don't have that
 * param until RequireAuth puts it there. The integration test below
 * exercises BOTH wrappers so the next-param plumbing is verified
 * end-to-end:
 *
 *   1. logged-out user types /library directly
 *   2. RequireAuth sees status='unauthed' → redirects to /login,
 *      MUST encode `/library` into ?next= (the bit that was broken)
 *   3. LoginScreen reads ?next= via useSearchParams() and submits
 *   4. After successful login, navigate(safeNext(next)) lands on
 *      /library, NOT /
 *
 * If RequireAuth ever drops ?next= (or moves it into router state
 * again), step 2 breaks and the assertion at the second checkpoint
 * fails loudly. That's the regression guard.
 */

import { render, fireEvent, waitFor, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../App';
import type { AuthUser } from '@hoard/types';

// Captures the current router location into a ref so tests can assert
// on URL transitions. MemoryRouter doesn't sync to window.location —
// the URL only lives in router state, so we read it via useLocation().
function LocationProbe({ onChange }: { onChange: (url: string) => void }) {
  const loc = useLocation();
  onChange(loc.pathname + loc.search);
  return null;
}

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual('../lib/api') as Record<string, unknown>;
  return {
    ...actual,
    api: {
      me: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      // Other API methods Library might call after login lands.
      // Default to empty so the test focuses on the URL transition.
      games: vi.fn().mockResolvedValue({ games: [], total: 0, page: 1, limit: 50, hasMore: false }),
      shelves: vi.fn().mockResolvedValue({
        shelves: { Playing: [], Backlog: [], Completed: [], 'On Hold': [], Dropped: [], Wishlist: [] },
        counts: {},
      }),
      gameCounts: vi.fn().mockResolvedValue({ counts: {} }),
      platformStatus: vi.fn().mockResolvedValue({ platforms: [] }),
      updateMe: vi.fn(),
    },
  };
});

import { api } from '../lib/api';

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'u-1',
    email: 'andrea@test',
    name: 'andrea',
    createdAt: '2026-05-09T00:00:00.000Z',
    status: 'ACTIVE',
    isAdmin: false,
    hasRequestedAccess: false,
    preferences: {
      hypeThreshold: 5, libraryView: 'shelves', showHltb: true,
      coverDensity: 'standard', terminalCursor: true,
    },
    ...overrides,
  };
}

beforeAll(() => {
  // jsdom shims (mirrors shell-persistence.test.tsx).
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('min-width: 1024px'),
      media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
  class StubResizeObserver {
    observe(): void {} unobserve(): void {} disconnect(): void {}
  }
  (window as unknown as { ResizeObserver: typeof StubResizeObserver }).ResizeObserver = StubResizeObserver;
});

beforeEach(() => {
  vi.clearAllMocks();
});

/* ── End-to-end deep-link preservation ── */

describe('Deep-link preservation: RequireAuth → LoginScreen → destination (regression guard for §4 + §5.2)', () => {
  it('logged-out request to /library lands on /library after sign-in (the canonical path)', async () => {
    // Step 1: app boots with no cookie. /api/auth/me 401s.
    (api.me as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('401'));

    let url = '/library';
    render(
      <MemoryRouter initialEntries={['/library']}>
        <LocationProbe onChange={(u) => { url = u; }} />
        <App />
      </MemoryRouter>,
    );

    // Step 2: RequireAuth should have redirected to /login WITH ?next=
    // encoded. This is the bit that was broken pre-fix — the redirect
    // used router state.from instead of a URL query param, so by the
    // time LoginScreen ran, params.get('next') was null and the user
    // landed on / regardless of where they came from.
    await waitFor(() => {
      expect(screen.queryByLabelText(/email/i)).toBeTruthy();
    });
    expect(url).toBe('/login?next=%2Flibrary');

    // Step 3: user submits the form with valid creds.
    const active = makeUser({ status: 'ACTIVE' });
    (api.login as ReturnType<typeof vi.fn>).mockResolvedValue({ user: active });

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'andrea@test' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    // Step 4: after successful login, the user MUST land on /library
    // — NOT /. The probe captures the post-login URL.
    await waitFor(() => {
      expect(url).toBe('/library');
    }, { timeout: 3000 });
  });

  it('logged-out request to /library?sort=playtime preserves the full path including search (?sort=)', async () => {
    (api.me as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('401'));

    let url = '/library?sort=playtime';
    render(
      <MemoryRouter initialEntries={['/library?sort=playtime']}>
        <LocationProbe onChange={(u) => { url = u; }} />
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText(/email/i)).toBeTruthy();
    });

    // Both pathname AND search must be encoded into ?next= so the
    // user lands on the EXACT URL they typed, including any sort /
    // filter params.
    expect(url).toBe('/login?next=%2Flibrary%3Fsort%3Dplaytime');
  });
});
