// TL1.4 tests for the EVENTS admin section. Six tests covering:
// hook returns first page / loadMore appends + hides button / row click
// toggles expanded JSON / empty state copy / no-chip on header (TL-D10) /
// nextCursor null terminator.

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { AuthUser, UserEventWithUser } from '@hoard/types';

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
        listFeedback: vi.fn(),
        markFeedbackRead: vi.fn(),
        deleteFeedback: vi.fn(),
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
import { AdminEvents } from '../admin/AdminEvents';
import { AdminPending } from '../admin/AdminPending';
import { AdminUsers } from '../admin/AdminUsers';
import { AdminCodes } from '../admin/AdminCodes';
import { AdminFeedback } from '../admin/AdminFeedback';

function makeAdmin(): AuthUser {
  return {
    id: 'admin-id', email: 'andrea@hoard', name: 'Andrea',
    createdAt: '2026-04-01T00:00:00.000Z',
    status: 'ACTIVE', isAdmin: true, hasRequestedAccess: false,
    preferences: { hypeThreshold: 5, libraryView: 'shelves', showHltb: true, coverDensity: 'standard', terminalCursor: true }, marketCode: null,
  };
}

function makeEvent(overrides: Partial<UserEventWithUser> = {}): UserEventWithUser {
  return {
    id: 'evt_1',
    userId: 'usr_1',
    event: 'wishlist.toggled',
    details: { igdbId: 12345, action: 'add' },
    createdAt: '2026-05-21T12:00:00.000Z',
    user: {
      id: 'usr_1',
      email: 'luigi@example.com',
      name: 'Luigi',
      displayIdentity: 'luigi@example.com',
    },
    ...overrides,
  };
}

function renderScreen(path: string = '/admin/events') {
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
  mockUseUser.mockReturnValue({ user: makeAdmin(), status: 'authed', setUser: vi.fn(), signOut: vi.fn(), refresh: vi.fn() });
  mockBp.mockReturnValue('desktop');
  (api.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (api.admin.listInviteCodes as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (api.admin.listFeedback as ReturnType<typeof vi.fn>).mockResolvedValue({
    items: [], nextCursor: null, unreadCount: 0,
  });
  // Default: empty events. Individual tests override.
  (api.admin.listEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
    items: [], nextCursor: null,
  });
});

describe('AdminScreen — EVENTS section', () => {
  it('renders the section header without a chip (no read-state per TL-D10)', async () => {
    (api.admin.listEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [makeEvent(), makeEvent({ id: 'evt_2', event: 'sync.first' })],
      nextCursor: null,
    });

    renderScreen();
    await waitFor(() => {
      expect(screen.getByText(/events \(2\)/i)).toBeTruthy();
    });
    // No unread chip — events don't have read-state. Belt+suspenders
    // assertion against future regressions that copy F1.4's chip into
    // this section.
    expect(screen.queryByText(/unread/i)).toBeNull();
  });

  it('renders the empty-state copy when there are no events yet', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('// no events yet')).toBeTruthy();
    });
  });

  it('row click toggles an expanded <pre> of the raw details JSON', async () => {
    (api.admin.listEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [makeEvent({ id: 'evt_zoom', event: 'wishlist.toggled', details: { igdbId: 99, action: 'add' } })],
      nextCursor: null,
    });

    renderScreen();
    const row = await screen.findByRole('button', { name: /event wishlist\.toggled/i });
    // Pre-expansion: pretty-printed JSON isn't rendered. The details
    // preview ("igdbId=99 · action=add") IS visible in the row, so we
    // can't just search for "99" to assert non-visibility. Instead
    // assert the expanded-only formatted indent — two-space JSON
    // pretty-print includes a literal `"igdbId": 99` substring that
    // the row preview's `igdbId=99` form doesn't.
    expect(screen.queryByText(/"igdbId": 99/)).toBeNull();

    fireEvent.click(row);
    expect(screen.getByText(/"igdbId": 99/)).toBeTruthy();

    // Toggle off.
    fireEvent.click(row);
    expect(screen.queryByText(/"igdbId": 99/)).toBeNull();
  });

  it('pagination: [load more] appears with nextCursor + appends rows + hides when terminator reached', async () => {
    (api.admin.listEvents as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        items: [makeEvent({ id: 'evt_p1', user: { id: 'u-p1', email: 'page1@x', name: null, displayIdentity: 'page1@x' } })],
        nextCursor: 'evt_p1',
      })
      .mockResolvedValueOnce({
        items: [makeEvent({ id: 'evt_p2', user: { id: 'u-p2', email: 'page2@x', name: null, displayIdentity: 'page2@x' } })],
        nextCursor: null,
      });

    renderScreen();
    const loadMore = await screen.findByRole('button', { name: /\[load more\]/ });
    fireEvent.click(loadMore);

    await waitFor(() => {
      // The hook calls api.admin.listEvents with { cursor: 'evt_p1', ... }
      // — verify the cursor was forwarded.
      const lastCall = (api.admin.listEvents as ReturnType<typeof vi.fn>).mock.calls.at(-1);
      expect(lastCall?.[0]).toMatchObject({ cursor: 'evt_p1' });
    });
    await waitFor(() => {
      expect(screen.getByText('page2@x')).toBeTruthy();
    });
    // Page 1 still present (appended, not replaced).
    expect(screen.getByText('page1@x')).toBeTruthy();
    // nextCursor === null is the terminator — button must disappear.
    expect(screen.queryByRole('button', { name: /\[load more\]/ })).toBeNull();
  });

  it('does NOT render [load more] when the first page already has nextCursor === null (single-page case)', async () => {
    (api.admin.listEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [makeEvent({ id: 'evt_only' })],
      nextCursor: null,
    });

    renderScreen();
    await screen.findByRole('button', { name: /event wishlist\.toggled/i });
    // Pre-condition: section rendered with content.
    expect(screen.queryByText(/\[load more\]/)).toBeNull();
  });

  it('renders without errors when details is null (e.g. session.opened with no UA captured)', async () => {
    (api.admin.listEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [makeEvent({ id: 'evt_no_details', event: 'session.opened', details: null })],
      nextCursor: null,
    });

    renderScreen();
    const row = await screen.findByRole('button', { name: /event session\.opened/i });

    // Click to expand — should render '// no details' instead of
    // crashing on JSON.stringify(null) or similar.
    fireEvent.click(row);
    expect(screen.getByText('// no details')).toBeTruthy();
  });
});
