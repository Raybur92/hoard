import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { AdminUser, AdminInviteCode, AuthUser } from '@hoard/types';

vi.mock('../../../lib/api', async () => {
  const actual = await vi.importActual('../../../lib/api') as Record<string, unknown>;
  return {
    ...actual,
    api: {
      admin: {
        listUsers: vi.fn(),
        listInviteCodes: vi.fn(),
        createInviteCode: vi.fn(),
        deleteInviteCode: vi.fn(),
        deleteUser: vi.fn(),
        // F1.4 of docs/FEEDBACK_PLAN.md — AdminScreen now also renders a
        // FEEDBACK section between PENDING and ALL USERS, so its hooks
        // expect these methods. Default to an empty list so the existing
        // I-series tests stay isolated from feedback-specific behaviour.
        listFeedback: vi.fn(),
        markFeedbackRead: vi.fn(),
        // TL1.4 of docs/TELEMETRY_PLAN.md — AdminScreen now also renders
        // an EVENTS section at the bottom, so its hooks expect this
        // method. Default to an empty list so existing tests stay
        // isolated from telemetry-specific behaviour.
        listEvents: vi.fn(),
      },
    },
  };
});

const mockUseUser = vi.fn();
vi.mock('../../../contexts/UserContext', () => ({
  useUser: () => mockUseUser(),
}));

const mockBp = vi.fn();
vi.mock('../../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => mockBp(),
}));

import { api } from '../../../lib/api';
import { AdminScreen } from '../AdminScreen';
import { AdminPending } from '../admin/AdminPending';
import { AdminUsers } from '../admin/AdminUsers';
import { AdminCodes } from '../admin/AdminCodes';
import { AdminFeedback } from '../admin/AdminFeedback';
import { AdminEvents } from '../admin/AdminEvents';

function makeAdmin(): AuthUser {
  return {
    id: 'admin-id', email: 'andrea@hoard', name: 'Andrea',
    createdAt: '2026-04-01T00:00:00.000Z',
    status: 'ACTIVE', isAdmin: true, hasRequestedAccess: false,
    preferences: { hypeThreshold: 5, libraryView: 'shelves', showHltb: true, coverDensity: 'standard', terminalCursor: true },
  };
}

function makeNonAdmin(): AuthUser {
  return { ...makeAdmin(), id: 'luigi-id', name: 'Luigi', isAdmin: false };
}

function makeUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 'u-1',
    email: 'a@example.com',
    displayIdentity: 'a@example.com',
    name: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    status: 'ACTIVE',
    isAdmin: false,
    hasRequestedAccess: false,
    accessRequestMessage: null,
    accessRequestedAt: null,
    redeemedCode: null,
    platforms: { count: 0, codes: [] },
    gamesCount: 0,
    wishlistCount: 0,
    ...overrides,
  };
}

function makeCode(overrides: Partial<AdminInviteCode> = {}): AdminInviteCode {
  return {
    id: 'c-1',
    code: 'HOARD-7K2M-PLAY',
    note: null,
    createdAt: '2026-05-08T00:00:00.000Z',
    usedAt: null,
    usedBy: null,
    ...overrides,
  };
}

/**
 * Renders the AdminScreen route tree at a given URL. Admin-IA redesign
 * (2026-05-29) split the monolithic page into sub-routes — tests now
 * choose which section to mount via the path arg. Default is
 * `/admin/users` which matches the previous default landing surface
 * (most legacy tests assert against the users-section content).
 */
function renderScreen(path: string = '/admin/users') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin" element={<AdminScreen />}>
          <Route index element={<Navigate to="users" replace />} />
          <Route path="pending" element={<AdminPending />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="codes" element={<AdminCodes />} />
          <Route path="feedback" element={<AdminFeedback />} />
          <Route path="events" element={<AdminEvents />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // SWR cache reset is handled globally in apps/web/src/test-setup.ts
  // via cache._resetForTests(). No per-file flush needed here.
  mockUseUser.mockReturnValue({ user: makeAdmin(), status: 'authed', setUser: vi.fn(), signOut: vi.fn(), refresh: vi.fn() });
  mockBp.mockReturnValue('desktop');
  (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (api.admin.listInviteCodes as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (api.admin.listFeedback as ReturnType<typeof vi.fn>).mockResolvedValue({
    items: [], nextCursor: null, unreadCount: 0,
  });
  (api.admin.listEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
    items: [], nextCursor: null,
  });
});

/* ── Defense-in-depth gating ── */

describe('AdminScreen — gating', () => {
  it('non-admin users get the 404 view (URL-typing defense)', () => {
    mockUseUser.mockReturnValue({ user: makeNonAdmin(), status: 'authed', setUser: vi.fn(), signOut: vi.fn(), refresh: vi.fn() });
    renderScreen();
    expect(screen.getByText('> 404')).toBeTruthy();
    // Admin sections never render for non-admins.
    expect(screen.queryByText(/HOARD ADMIN/i)).toBeNull();
  });

  it('mobile breakpoint shows the desktop-only fallback (I-D3)', () => {
    mockBp.mockReturnValue('mobile');
    renderScreen();
    expect(screen.getByText(/admin panel is desktop-only/i)).toBeTruthy();
    expect(screen.queryByText(/HOARD ADMIN/i)).toBeNull();
  });
});

/* ── Sections render ── */

describe('AdminScreen — sidebar nav (admin-IA redesign)', () => {
  it('sidebar shows count badges for every section, reflecting the loaded data', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeUser({ id: 'u-1', displayIdentity: 'pending@x.com', status: 'PENDING_INVITE', hasRequestedAccess: true, accessRequestedAt: '2026-05-09T00:00:00.000Z', accessRequestMessage: 'Hi I am Marco' }),
      makeUser({ id: 'u-2', displayIdentity: 'andrea@x.com' }),
    ]);
    (api.admin.listInviteCodes as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeCode({ id: 'c-1', code: 'HOARD-AAAA-BBBB' }),
    ]);

    renderScreen();
    await waitFor(() => {
      // Sidebar links carry the count next to each label.
      expect(screen.getByRole('link', { name: /users 2/i })).toBeTruthy();
      expect(screen.getByRole('link', { name: /pending 1/i })).toBeTruthy();
      expect(screen.getByRole('link', { name: /codes 1/i })).toBeTruthy();
    });
  });

  it('empty-data state: counts default to 0 / ∞ for events', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /users 0/i })).toBeTruthy();
      expect(screen.getByRole('link', { name: /codes 0/i })).toBeTruthy();
      expect(screen.getByRole('link', { name: /events ∞/i })).toBeTruthy();
    });
  });
});

describe('AdminScreen — /admin/pending section', () => {
  it('only puts pending-WITH-request users in the pending section, not pending-no-request', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeUser({ id: 'pr', displayIdentity: 'requested@x.com', status: 'PENDING_INVITE', hasRequestedAccess: true, accessRequestedAt: '2026-05-09T00:00:00.000Z' }),
      makeUser({ id: 'pnr', displayIdentity: 'pending-no-request@x.com', status: 'PENDING_INVITE', hasRequestedAccess: false }),
    ]);
    renderScreen('/admin/pending');
    await waitFor(() => {
      expect(screen.getByText(/pending access requests \(1\)/i)).toBeTruthy();
      expect(screen.getByText('requested@x.com')).toBeTruthy();
      // pending-no-request user does NOT render here — they live in /admin/users.
      expect(screen.queryByText('pending-no-request@x.com')).toBeNull();
    });
  });

  it('renders the "(no message)" placeholder when a request has no message', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeUser({ id: 'pr', displayIdentity: 'no-msg@x.com', status: 'PENDING_INVITE', hasRequestedAccess: true, accessRequestedAt: '2026-05-09T00:00:00.000Z', accessRequestMessage: null }),
    ]);
    renderScreen('/admin/pending');
    await waitFor(() => {
      expect(screen.getByText('(no message)')).toBeTruthy();
    });
  });

  it('shows the empty-state copy when there are no pending requests', async () => {
    renderScreen('/admin/pending');
    await waitFor(() => {
      expect(screen.getByText('// no pending requests')).toBeTruthy();
    });
  });
});

/* ── Generate code flow ── */

describe('AdminScreen — generate code flow', () => {
  it('[+ generate code] CTA in the /admin/codes section opens the modal in prompt state', async () => {
    // Admin-IA redesign: the CTA moved from the top-bar to the codes
    // section header (where its output goes).
    renderScreen('/admin/codes');
    fireEvent.click(screen.getByRole('button', { name: /\+ generate code/i }));
    expect(screen.getByText('> generate invite code')).toBeTruthy();
    expect(screen.getByLabelText(/note/i)).toBeTruthy();
  });

  it('per-pending-row "generate code for X" button pre-fills the note with email local-part (no name set)', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeUser({
        id: 'pr',
        email: 'marco@gmail.com',
        name: null,
        displayIdentity: 'marco@gmail.com',
        status: 'PENDING_INVITE',
        hasRequestedAccess: true,
        accessRequestedAt: '2026-05-09T00:00:00.000Z',
      }),
    ]);
    renderScreen('/admin/pending');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate code for marco/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /generate code for marco/i }));
    const input = screen.getByLabelText(/note/i) as HTMLInputElement;
    // Pre-filled with `for <noteLabel>` — local-part of email when name
    // is null, NOT the full email. Helps the codes list stay readable.
    expect(input.value).toBe('for marco');
  });

  it('button label + pre-fill note BOTH use the compact noteLabel; row identity header carries the full displayIdentity', async () => {
    // After the post-launch admin polish (commit `<this>`):
    //   - Button label = noteLabel (compact recognizer; "GENERATE CODE
    //     FOR MARCO ROSSI" rather than "...FOR MARCO.ROSSI@EXAMPLE.COM")
    //   - Pre-fill note = noteLabel (unchanged from earlier — same value)
    //   - Row identity header above the button = displayIdentity (full
    //     email; provides ground-truth context one line up so the button
    //     can stay compact without losing identifying info)
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeUser({
        id: 'pr',
        email: 'marco.rossi@example.com',
        name: 'Marco Rossi',
        displayIdentity: 'marco.rossi@example.com',
        status: 'PENDING_INVITE',
        hasRequestedAccess: true,
        accessRequestedAt: '2026-05-09T00:00:00.000Z',
      }),
    ]);
    renderScreen('/admin/pending');
    await waitFor(() => {
      // Button text uses noteLabel (User.name when set).
      expect(screen.getByRole('button', { name: /generate code for Marco Rossi/i })).toBeTruthy();
      // Full email shows in the pending-row identity header. The
      // all-users section is on a different route now, so we only
      // assert presence on the pending route.
      expect(screen.getByText('marco.rossi@example.com')).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /generate code for Marco Rossi/i }));
    // Pre-fill uses noteLabel — same as button, by design.
    expect((screen.getByLabelText(/note/i) as HTMLInputElement).value).toBe('for Marco Rossi');
  });

  it('pre-fill falls back to "Steam user — {id}" for synthetic-Steam accounts without a name', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeUser({
        id: 'pr',
        email: 'steam:76561198012345678@hoard.internal',
        name: null,
        displayIdentity: 'Steam user — 76561198012345678',
        status: 'PENDING_INVITE',
        hasRequestedAccess: true,
        accessRequestedAt: '2026-05-09T00:00:00.000Z',
      }),
    ]);
    renderScreen('/admin/pending');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate code for Steam user — 76561198012345678/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /generate code for Steam user/i }));
    expect((screen.getByLabelText(/note/i) as HTMLInputElement).value).toBe('for Steam user — 76561198012345678');
  });

  it('successful generation transitions modal to created state with the code + copy button', async () => {
    (api.admin.createInviteCode as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCode({ id: 'c-new', code: 'HOARD-NEW1-2345', note: 'spare' }),
    );
    renderScreen('/admin/codes');
    fireEvent.click(screen.getByRole('button', { name: /\+ generate code/i }));
    fireEvent.change(screen.getByLabelText(/note/i), { target: { value: 'spare' } });
    fireEvent.click(screen.getByRole('button', { name: /\$ generate/i }));

    await waitFor(() => {
      expect(screen.getByText('> new code generated')).toBeTruthy();
      expect(screen.getByText('HOARD-NEW1-2345')).toBeTruthy();
      expect(screen.getByRole('button', { name: /copy code to clipboard/i })).toBeTruthy();
    });
  });

  it('passes undefined for empty note (server-side default keeps `note` nullable)', async () => {
    (api.admin.createInviteCode as ReturnType<typeof vi.fn>).mockResolvedValue(makeCode({ id: 'c-new' }));
    renderScreen('/admin/codes');
    fireEvent.click(screen.getByRole('button', { name: /\+ generate code/i }));
    fireEvent.click(screen.getByRole('button', { name: /\$ generate/i }));

    await waitFor(() => {
      expect(api.admin.createInviteCode).toHaveBeenCalledWith(undefined);
    });
  });
});

/* ── Refresh ── */

describe('AdminScreen — refresh', () => {
  it('[refresh] invalidates both admin caches (users + invite-codes)', async () => {
    renderScreen();
    await waitFor(() => {
      expect(api.admin.listUsers).toHaveBeenCalledTimes(1);
      expect(api.admin.listInviteCodes).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await waitFor(() => {
      expect(api.admin.listUsers).toHaveBeenCalledTimes(2);
      expect(api.admin.listInviteCodes).toHaveBeenCalledTimes(2);
    });
  });
});

/* ── Revoke ── */

describe('AdminScreen — revoke unused code', () => {
  it('[revoke] confirms then calls api.admin.deleteInviteCode', async () => {
    (api.admin.listInviteCodes as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeCode({ id: 'c-1', code: 'HOARD-AAAA-BBBB', note: 'spare' }),
    ]);
    (api.admin.deleteInviteCode as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderScreen('/admin/codes');
    await waitFor(() => {
      expect(screen.getByText('HOARD-AAAA-BBBB')).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /revoke/i }));

    await waitFor(() => {
      expect(api.admin.deleteInviteCode).toHaveBeenCalledWith('c-1');
    });
    confirmSpy.mockRestore();
  });

  it('[revoke] does NOT delete when the confirm prompt is cancelled', async () => {
    (api.admin.listInviteCodes as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeCode({ id: 'c-1', code: 'HOARD-AAAA-BBBB' }),
    ]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderScreen('/admin/codes');
    await waitFor(() => {
      expect(screen.getByText('HOARD-AAAA-BBBB')).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /revoke/i }));
    expect(api.admin.deleteInviteCode).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('used codes do NOT show a [revoke] button (server returns 409 anyway)', async () => {
    (api.admin.listInviteCodes as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeCode({ id: 'c-used', code: 'HOARD-USED-CODE', usedAt: '2026-05-09T00:00:00.000Z', usedBy: { id: 'u', email: 'x@y.com', displayIdentity: 'x@y.com' } }),
    ]);
    renderScreen('/admin/codes');
    await waitFor(() => {
      expect(screen.getByText('HOARD-USED-CODE')).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: /revoke/i })).toBeNull();
  });
});

/* ── A1 commit 4 ── filter / search / sort / delete ── */

/**
 * Legacy helper for tests that depend on URL query params landing on
 * the users section. Maps `/admin?...` to `/admin/users?...` so the
 * existing assertions still target the right route. New tests should
 * call `renderScreen('/admin/users?filter=...')` directly.
 */
function renderScreenWithUrl(url: string) {
  if (url.startsWith('/admin?')) {
    url = url.replace('/admin?', '/admin/users?');
  } else if (url === '/admin') {
    url = '/admin/users';
  }
  return _legacyRenderScreenWithUrl(url);
}

function _legacyRenderScreenWithUrl(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/admin" element={<AdminScreen />}>
          <Route index element={<Navigate to="users" replace />} />
          <Route path="pending" element={<AdminPending />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="codes" element={<AdminCodes />} />
          <Route path="feedback" element={<AdminFeedback />} />
          <Route path="events" element={<AdminEvents />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const userFixtures = () => [
  makeUser({
    id: 'admin-id',
    email: 'andrea@hoard.lan',
    displayIdentity: 'andrea@hoard.lan',
    name: 'Andrea',
    isAdmin: true,
    status: 'ACTIVE',
    createdAt: '2026-04-01T00:00:00.000Z',
    platforms: { count: 4, codes: ['ST', 'PS', 'XB', 'GG'] },
    gamesCount: 745,
    wishlistCount: 12,
  }),
  makeUser({
    id: 'luigi-id',
    email: 'luigi@hoard.lan',
    displayIdentity: 'luigi@hoard.lan',
    name: 'Luigi',
    isAdmin: false,
    status: 'ACTIVE',
    createdAt: '2026-05-05T00:00:00.000Z',
    platforms: { count: 2, codes: ['ST', 'PS'] },
    gamesCount: 488,
    wishlistCount: 5,
  }),
  makeUser({
    id: 'marco-id',
    email: 'marco@example.com',
    displayIdentity: 'marco@example.com',
    name: null,
    isAdmin: false,
    status: 'ACTIVE',
    createdAt: '2026-05-09T00:00:00.000Z',
    platforms: { count: 1, codes: ['ST'] },
    gamesCount: 42,
    wishlistCount: 0,
  }),
  makeUser({
    id: 'pending-id',
    email: 'sara@example.com',
    displayIdentity: 'sara@example.com',
    name: null,
    isAdmin: false,
    status: 'PENDING_INVITE',
    hasRequestedAccess: true,
    accessRequestedAt: '2026-05-10T00:00:00.000Z',
    accessRequestMessage: 'hi',
    createdAt: '2026-05-10T00:00:00.000Z',
    platforms: { count: 0, codes: [] },
    gamesCount: 0,
    wishlistCount: 0,
  }),
];

describe('AdminScreen — filter chips (A-D9 strict semantics)', () => {
  it('default filter "all" shows every user with the right counts on each chip', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue(userFixtures());
    renderScreen();
    await waitFor(() => expect(screen.getByText(/andrea@hoard\.lan/)).toBeTruthy());
    // Counts on chips: all (4) · active (2 = luigi+marco, NOT andrea-admin) ·
    // pending (1 = sara) · admin (1 = andrea).
    expect(screen.getByRole('button', { name: /Filter users: all/ })).toHaveTextContent('all (4)');
    expect(screen.getByRole('button', { name: /Filter users: active/ })).toHaveTextContent('active (2)');
    expect(screen.getByRole('button', { name: /Filter users: pending/ })).toHaveTextContent('pending (1)');
    expect(screen.getByRole('button', { name: /Filter users: admin/ })).toHaveTextContent('admin (1)');
  });

  it('"active" filter EXCLUDES admins (A-D9 strict) — assertion scoped via [delete] button presence in ALL USERS', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue(userFixtures());
    renderScreenWithUrl('/admin?filter=active');
    // Assertion via [delete] buttons because they only render inside
    // ALL USERS rows. PENDING REQUESTS renders sara unconditionally
    // regardless of the chip filter (filter scope is ALL USERS only).
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Delete luigi@hoard\.lan/ })).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: /Delete marco@example\.com/ })).toBeTruthy();
    // No delete button for andrea (admin hidden from ALL USERS) or
    // sara (pending hidden from ALL USERS).
    expect(screen.queryByRole('button', { name: /Delete andrea@hoard\.lan/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Delete sara@example\.com/ })).toBeNull();
  });

  it('"admin" filter shows only admins in ALL USERS', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue(userFixtures());
    renderScreenWithUrl('/admin?filter=admin');
    // Andrea is the current admin (own row → no [delete] button per A-D2)
    // so we can't use the [delete]-button-presence proxy here. Instead
    // assert that no NON-admin row's [delete] button is rendered.
    await waitFor(() => expect(screen.getByText(/andrea@hoard\.lan/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Delete luigi@hoard\.lan/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Delete marco@example\.com/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Delete sara@example\.com/ })).toBeNull();
  });

  it('"pending" filter shows pending users in ALL USERS (sara also persists in PENDING REQUESTS section)', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue(userFixtures());
    renderScreenWithUrl('/admin?filter=pending');
    // Sara now has a [delete] button — only present in ALL USERS rows.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Delete sara@example\.com/ })).toBeTruthy(),
    );
    // Active + admin users are hidden from ALL USERS.
    expect(screen.queryByRole('button', { name: /Delete luigi@hoard\.lan/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Delete marco@example\.com/ })).toBeNull();
    // Andrea is the admin (own row, never gets a button anyway).
    expect(screen.queryByRole('button', { name: /Delete andrea@hoard\.lan/ })).toBeNull();
  });
});

describe('AdminScreen — search (A-D8 no debounce)', () => {
  it('filters users by email substring (case-insensitive)', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue(userFixtures());
    renderScreenWithUrl('/admin?q=marco');
    await waitFor(() => expect(screen.getByText(/marco@example\.com/)).toBeTruthy());
    expect(screen.queryByText(/luigi@hoard\.lan/)).toBeNull();
  });

  it('filters by name when set', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue(userFixtures());
    renderScreenWithUrl('/admin?q=Luigi');
    await waitFor(() => expect(screen.getByText(/luigi@hoard\.lan/)).toBeTruthy());
    expect(screen.queryByText(/marco@example\.com/)).toBeNull();
  });

  it('typing into the search input updates URL on every keystroke (no debounce)', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue(userFixtures());
    renderScreen();
    await waitFor(() => expect(screen.getByText(/andrea@hoard\.lan/)).toBeTruthy());
    const input = screen.getByPlaceholderText('find by email or name…') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'marco' } });
    // After the keystroke, only marco's row remains.
    await waitFor(() => expect(screen.queryByText(/luigi@hoard\.lan/)).toBeNull());
    expect(screen.getByText(/marco@example\.com/)).toBeTruthy();
  });

  it('search + filter compose (active filter + search "lui" returns only luigi)', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue(userFixtures());
    renderScreenWithUrl('/admin?filter=active&q=lui');
    await waitFor(() => expect(screen.getByText(/luigi@hoard\.lan/)).toBeTruthy());
    expect(screen.queryByText(/marco@example\.com/)).toBeNull(); // active but no match
    expect(screen.queryByText(/andrea@hoard\.lan/)).toBeNull(); // matches but admin excluded
  });

  it('shows the no-match empty state when search returns nothing', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue(userFixtures());
    renderScreenWithUrl('/admin?q=zzzznothing');
    await waitFor(() => expect(screen.getByText(/no users match "zzzznothing"/)).toBeTruthy());
  });
});

describe('AdminScreen — sort cycle button (joined → status → platforms)', () => {
  it('default sort label is "sort: joined ↓"', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue(userFixtures());
    renderScreen();
    await waitFor(() => expect(screen.getByText(/sort: joined ↓/)).toBeTruthy());
  });

  it('clicking the sort button cycles joined → status → platforms → joined', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue(userFixtures());
    renderScreen();
    await waitFor(() => expect(screen.getByText(/sort: joined ↓/)).toBeTruthy());
    const button = screen.getByRole('button', { name: /Cycle sort:/ });
    fireEvent.click(button);
    // Status label has NO ↓ arrow (bucket-based, not asc/desc). Match
    // a closing-bracket boundary so we only hit the actual sort label,
    // not e.g. "sort: status sub-text" elsewhere.
    await waitFor(() => expect(screen.getByText(/sort: status\s*\]/)).toBeTruthy());
    // Defensive negative: explicitly assert the ↓ arrow is NOT present
    // for status (would mean we accidentally appended one).
    expect(screen.queryByText(/sort: status ↓/)).toBeNull();
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByText(/sort: platforms ↓/)).toBeTruthy());
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByText(/sort: joined ↓/)).toBeTruthy());
  });

  it('sort=status puts pending first, then active (non-admin), then admin', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue(userFixtures());
    renderScreenWithUrl('/admin?sort=status');
    await waitFor(() => expect(screen.getByText(/sort: status\s*\]/)).toBeTruthy());
    // Find row order in the ALL USERS section (skip pending requests
    // + invite codes sections — we only care about ALL USERS rows
    // that contain the email cell). Pull the rendered identity texts
    // in document order.
    const idents = screen.getAllByText(/@hoard\.lan|@example\.com/).map((n) => n.textContent ?? '');
    // First occurrence of each identity is the canonical row position.
    // Expected ordering: pending (sara) → active non-admin (luigi, marco) → admin (andrea).
    const firstIdx = (s: string) => idents.findIndex((t) => t.includes(s));
    expect(firstIdx('sara@example.com')).toBeLessThan(firstIdx('luigi@hoard.lan'));
    expect(firstIdx('luigi@hoard.lan')).toBeLessThan(firstIdx('andrea@hoard.lan'));
  });

  it('sort=platforms puts highest-count user first', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue(userFixtures());
    renderScreenWithUrl('/admin?sort=platforms');
    await waitFor(() => expect(screen.getByText(/sort: platforms ↓/)).toBeTruthy());
    const idents = screen.getAllByText(/@hoard\.lan|@example\.com/).map((n) => n.textContent ?? '');
    const firstIdx = (s: string) => idents.findIndex((t) => t.includes(s));
    expect(firstIdx('andrea@hoard.lan')).toBeLessThan(firstIdx('luigi@hoard.lan'));
    expect(firstIdx('luigi@hoard.lan')).toBeLessThan(firstIdx('marco@example.com'));
  });
});

describe('AdminScreen — UserRow density (A-D10 + A-D11)', () => {
  it('renders identity as "<name> · <email>" when both are set (A-D10)', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeUser({
        id: 'u-both',
        email: 'andreacama92@gmail.com',
        displayIdentity: 'andreacama92@gmail.com',
        name: 'Bedkarma',
      }),
    ]);
    renderScreen();
    await waitFor(() => expect(screen.getByText('Bedkarma')).toBeTruthy());
    expect(screen.getByText(/andreacama92@gmail\.com/)).toBeTruthy();
  });

  it('renders the PLATFORMS column as "N platforms · M games" when data present (A-D11(3))', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeUser({
        id: 'u-data',
        email: 'a@b.com',
        displayIdentity: 'a@b.com',
        platforms: { count: 2, codes: ['ST', 'PS'] },
        gamesCount: 488,
      }),
    ]);
    renderScreen();
    await waitFor(() => expect(screen.getByText(/2 platforms · 488 games/)).toBeTruthy());
  });

  it('singularises platforms / games when count is 1', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeUser({
        id: 'u-one',
        email: 'a@b.com',
        displayIdentity: 'a@b.com',
        platforms: { count: 1, codes: ['ST'] },
        gamesCount: 1,
      }),
    ]);
    renderScreen();
    await waitFor(() => expect(screen.getByText(/1 platform · 1 game/)).toBeTruthy());
  });

  it('renders an em-dash when both counts are zero (no "0 platforms · 0 games" noise)', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeUser({
        id: 'u-empty',
        email: 'pending@example.com',
        displayIdentity: 'pending@example.com',
        platforms: { count: 0, codes: [] },
        gamesCount: 0,
      }),
    ]);
    renderScreen();
    await waitFor(() => expect(screen.getByText(/pending@example\.com/)).toBeTruthy());
    // Em-dash present in the platforms cell.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('AdminScreen — delete user flow (A-D2 + A-D6 + A-D11)', () => {
  it('[delete] button does NOT render on the admin\'s own row (A-D2 frontend guard)', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue(userFixtures());
    renderScreen();
    await waitFor(() => expect(screen.getByText(/andrea@hoard\.lan/)).toBeTruthy());
    // Andrea is the admin (id='admin-id'); makeAdmin() sets her id
    // to 'admin-id' too. So no [delete] button on her row.
    expect(screen.queryByRole('button', { name: /Delete andrea@hoard\.lan/ })).toBeNull();
    // But other users DO have [delete] buttons.
    expect(screen.getByRole('button', { name: /Delete luigi@hoard\.lan/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Delete marco@example\.com/ })).toBeTruthy();
  });

  it('clicking [delete] opens ConfirmModal with displayIdentity as both subject and confirmKeyword (A-D6)', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue(userFixtures());
    renderScreen();
    await waitFor(() => expect(screen.getByRole('button', { name: /Delete luigi@hoard\.lan/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Delete luigi@hoard\.lan/ }));
    // Modal headline contains the displayIdentity.
    expect(screen.getByText(/delete luigi@hoard\.lan/)).toBeTruthy();
    // "type luigi@hoard.lan to confirm" prompt is rendered.
    expect(screen.getByPlaceholderText('type luigi@hoard.lan')).toBeTruthy();
  });

  it('modal renders the games + platforms count line (A-D11) — wishlists NOT shown', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue(userFixtures());
    renderScreen();
    await waitFor(() => expect(screen.getByRole('button', { name: /Delete luigi@hoard\.lan/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Delete luigi@hoard\.lan/ }));
    // luigi has gamesCount=488 + platforms.count=2.
    expect(screen.getByText(/488 games · 2 platforms/)).toBeTruthy();
    // luigi has wishlistCount=5; that number must NOT appear in modal copy.
    // (The ConfirmModal test file already locks the prop-shape side; here
    // we lock the screen-side that no count line includes the wishlist.)
    expect(screen.queryByText(/5 wishlists?/)).toBeNull();
  });

  it('typing the displayIdentity unlocks confirm; clicking it calls api.admin.deleteUser', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue(userFixtures());
    (api.admin.deleteUser as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    renderScreen();
    await waitFor(() => expect(screen.getByRole('button', { name: /Delete luigi@hoard\.lan/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Delete luigi@hoard\.lan/ }));
    const input = screen.getByPlaceholderText('type luigi@hoard.lan');
    fireEvent.change(input, { target: { value: 'luigi@hoard.lan' } });
    const confirmBtn = screen.getByRole('button', { name: /delete user/ });
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(api.admin.deleteUser).toHaveBeenCalledWith('luigi-id'));
  });

  it('successful delete shows the // deleted: <displayIdentity> toast', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue(userFixtures());
    (api.admin.deleteUser as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    renderScreen();
    await waitFor(() => expect(screen.getByRole('button', { name: /Delete marco@example\.com/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Delete marco@example\.com/ }));
    fireEvent.change(screen.getByPlaceholderText('type marco@example.com'), { target: { value: 'marco@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /delete user/ }));
    await waitFor(() => expect(api.admin.deleteUser).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/\/\/ deleted: marco@example\.com/)).toBeTruthy());
  });

  it('paranoia self-delete defence: even if currentUser somehow matches a row, deleteUser is never called', async () => {
    // Construct a fixture where the admin's own row appears AND
    // somehow has a [delete] button rendered (shouldn't happen given
    // the !isSelf guard, but pin it). We force the issue by passing
    // a currentUser whose id matches a non-admin row, making both
    // sides of the conditional align "wrong" — this verifies the
    // server-side belt is intact even when the suspenders fail.
    mockUseUser.mockReturnValue({
      user: { ...makeAdmin(), id: 'luigi-id' }, // currentUser = luigi
      status: 'authed', setUser: vi.fn(), signOut: vi.fn(), refresh: vi.fn(),
    });
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue(userFixtures());
    (api.admin.deleteUser as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    renderScreen();
    // Luigi's [delete] button no longer renders — verifies isSelf works.
    await waitFor(() => expect(screen.getByText(/luigi@hoard\.lan/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Delete luigi@hoard\.lan/ })).toBeNull();
  });
});
