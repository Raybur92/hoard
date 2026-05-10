import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
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
import * as cache from '../../../lib/cache';
import { AdminScreen } from '../AdminScreen';

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

function renderScreen() {
  return render(
    <MemoryRouter>
      <AdminScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // The SWR cache (apps/web/src/lib/cache.ts) is module-singleton and
  // persists across tests in the same file — without flushing here,
  // earlier tests' resolved data leaks into later tests via cached
  // entries under `admin:users` / `admin:invite-codes`.
  cache.invalidate('');
  mockUseUser.mockReturnValue({ user: makeAdmin(), status: 'authed', setUser: vi.fn(), signOut: vi.fn(), refresh: vi.fn() });
  mockBp.mockReturnValue('desktop');
  (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (api.admin.listInviteCodes as ReturnType<typeof vi.fn>).mockResolvedValue([]);
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

describe('AdminScreen — sections', () => {
  it('renders all three section headers with counts', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeUser({ id: 'u-1', displayIdentity: 'pending@x.com', status: 'PENDING_INVITE', hasRequestedAccess: true, accessRequestedAt: '2026-05-09T00:00:00.000Z', accessRequestMessage: 'Hi I am Marco' }),
      makeUser({ id: 'u-2', displayIdentity: 'andrea@x.com' }),
    ]);
    (api.admin.listInviteCodes as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeCode({ id: 'c-1', code: 'HOARD-AAAA-BBBB' }),
    ]);

    renderScreen();
    await waitFor(() => {
      expect(screen.getByText(/pending access requests \(1\)/i)).toBeTruthy();
      expect(screen.getByText(/all users \(2\)/i)).toBeTruthy();
      expect(screen.getByText(/invite codes \(1\)/i)).toBeTruthy();
    });
  });

  it('shows empty-state copy for each section when nothing is present', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('// no pending requests')).toBeTruthy();
      expect(screen.getByText('// no users')).toBeTruthy();
      expect(screen.getByText('// no invite codes yet')).toBeTruthy();
    });
  });

  it('only puts pending-WITH-request users in the pending section, not pending-no-request', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeUser({ id: 'pr', displayIdentity: 'requested@x.com', status: 'PENDING_INVITE', hasRequestedAccess: true, accessRequestedAt: '2026-05-09T00:00:00.000Z' }),
      makeUser({ id: 'pnr', displayIdentity: 'pending-no-request@x.com', status: 'PENDING_INVITE', hasRequestedAccess: false }),
    ]);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText(/pending access requests \(1\)/i)).toBeTruthy();
      expect(screen.getByText(/all users \(2\)/i)).toBeTruthy();
    });
  });

  it('renders the "(no message)" placeholder when a request has no message', async () => {
    (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeUser({ id: 'pr', displayIdentity: 'no-msg@x.com', status: 'PENDING_INVITE', hasRequestedAccess: true, accessRequestedAt: '2026-05-09T00:00:00.000Z', accessRequestMessage: null }),
    ]);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('(no message)')).toBeTruthy();
    });
  });
});

/* ── Generate code flow ── */

describe('AdminScreen — generate code flow', () => {
  it('top-bar [+ generate code] opens the modal in prompt state', async () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /generate code/i }));
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
    renderScreen();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate code for marco/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /generate code for marco/i }));
    const input = screen.getByLabelText(/note/i) as HTMLInputElement;
    // Pre-filled with `for <noteLabel>` — local-part of email when name
    // is null, NOT the full email. Helps the codes list stay readable.
    expect(input.value).toBe('for marco');
  });

  it('pre-fill prefers User.name when set; button label still shows displayIdentity (ground truth)', async () => {
    // Two distinct concerns:
    //   - Button label = displayIdentity (what the admin is acting on,
    //     ground-truth identifier for picking the right row).
    //   - Pre-fill note = noteLabel (compact recognizer for the codes
    //     list later).
    // For email-based users with a name set, these differ: button
    // shows the email, note pre-fills with the name.
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
    renderScreen();
    await waitFor(() => {
      // Button text uses displayIdentity (ground truth).
      expect(screen.getByRole('button', { name: /generate code for marco\.rossi@example\.com/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /generate code for marco\.rossi@example\.com/i }));
    // Pre-fill uses noteLabel (compact recognizer).
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
    renderScreen();
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
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /generate code/i }));
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
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /generate code/i }));
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

    renderScreen();
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

    renderScreen();
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
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('HOARD-USED-CODE')).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: /revoke/i })).toBeNull();
  });
});
