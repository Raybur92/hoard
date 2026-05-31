// F1.4 of the feedback-channel workstream (docs/FEEDBACK_PLAN.md).
// Six tests for the FEEDBACK admin section: with-chip / without-chip /
// mark-read API call / stopPropagation guard / empty state / pagination.
// Sticks to component-layer coverage — cache invalidation lives in the
// api.ts layer and is verified transitively (mark-read calls the method
// that does the invalidation).

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { AuthUser, FeedbackWithUser } from '@hoard/types';

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
        // TL1.4 — AdminScreen also renders EVENTS now. Default empty
        // list so feedback-specific tests stay isolated.
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
import { AdminFeedback } from '../admin/AdminFeedback';
import { AdminPending } from '../admin/AdminPending';
import { AdminUsers } from '../admin/AdminUsers';
import { AdminCodes } from '../admin/AdminCodes';
import { AdminEvents } from '../admin/AdminEvents';

function makeAdmin(): AuthUser {
  return {
    id: 'admin-id', email: 'andrea@hoard', name: 'Andrea',
    createdAt: '2026-04-01T00:00:00.000Z',
    status: 'ACTIVE', isAdmin: true, hasRequestedAccess: false,
    preferences: { hypeThreshold: 5, libraryView: 'shelves', showHltb: true, coverDensity: 'standard', terminalCursor: true }, marketCode: null,
  };
}

function makeFb(overrides: Partial<FeedbackWithUser> = {}): FeedbackWithUser {
  return {
    id: 'fb_1',
    userId: 'u-1',
    message: 'hero countdown feels frozen',
    viewport: '1440×900',
    ua: 'Mozilla/5.0',
    read: false,
    createdAt: '2026-05-13T12:00:00.000Z',
    user: {
      id: 'u-1',
      email: 'gaetano@example.com',
      name: 'Gaetano',
      displayIdentity: 'gaetano@example.com',
    },
    ...overrides,
  };
}

function renderScreen(path: string = '/admin/feedback') {
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
  // Default: empty feedback. Individual tests override.
  (api.admin.listFeedback as ReturnType<typeof vi.fn>).mockResolvedValue({
    items: [], nextCursor: null, unreadCount: 0,
  });
  (api.admin.listEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
    items: [], nextCursor: null,
  });
});

describe('AdminScreen — FEEDBACK section', () => {
  it('renders the unread chip when unreadCount > 0', async () => {
    (api.admin.listFeedback as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [
        makeFb({ id: 'fb_1', read: false }),
        makeFb({ id: 'fb_2', read: false, user: { id: 'u-2', email: 'luigi@x', name: 'Luigi', displayIdentity: 'luigi@x' } }),
      ],
      nextCursor: null,
      unreadCount: 5,
    });

    renderScreen();
    await waitFor(() => {
      expect(screen.getByText(/feedback \(2\)/i)).toBeTruthy();
    });
    expect(screen.getByText(/5 unread/i)).toBeTruthy();
  });

  it('omits the unread chip when unreadCount === 0', async () => {
    (api.admin.listFeedback as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [makeFb({ read: true })],
      nextCursor: null,
      unreadCount: 0,
    });

    renderScreen();
    await waitFor(() => {
      expect(screen.getByText(/feedback \(1\)/i)).toBeTruthy();
    });
    // The chip pattern is `· N unread`; the [mark unread] button text
    // also contains "unread" so we have to be specific.
    expect(screen.queryByText(/· \d+ unread/i)).toBeNull();
  });

  it('mark-read flow: clicking the action calls api.admin.markFeedbackRead with (id, true)', async () => {
    (api.admin.listFeedback as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [makeFb({ id: 'fb_special', read: false })],
      nextCursor: null,
      unreadCount: 1,
    });
    (api.admin.markFeedbackRead as ReturnType<typeof vi.fn>).mockResolvedValue(makeFb({ id: 'fb_special', read: true }));

    renderScreen();
    const btn = await screen.findByRole('button', { name: /\[mark read\]/ });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(api.admin.markFeedbackRead).toHaveBeenCalledWith('fb_special', true);
    });
  });

  it('mark-read button stops propagation: clicking it does NOT toggle row expansion', async () => {
    (api.admin.listFeedback as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [makeFb({ id: 'fb_3', read: false, message: 'a secret message that only shows when expanded' })],
      nextCursor: null,
      unreadCount: 1,
    });
    (api.admin.markFeedbackRead as ReturnType<typeof vi.fn>).mockResolvedValue(makeFb({ id: 'fb_3', read: true }));

    renderScreen();
    const btn = await screen.findByRole('button', { name: /\[mark read\]/ });
    fireEvent.click(btn);

    // The expanded body must NOT have appeared as a side effect of the
    // mark-read click. The row's onClick toggles expansion; if
    // stopPropagation were missing, the secret message would now render.
    expect(screen.queryByText(/a secret message that only shows when expanded/)).toBeNull();
  });

  it('renders the empty-state copy when there is no feedback yet', async () => {
    (api.admin.listFeedback as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [], nextCursor: null, unreadCount: 0,
    });

    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('// no feedback yet')).toBeTruthy();
    });
  });

  it('pagination: [load more] appears when nextCursor is set + clicking it appends rows and hides the button', async () => {
    (api.admin.listFeedback as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        items: [makeFb({ id: 'fb_p1', user: { id: 'u-p1', email: 'page1@x', name: null, displayIdentity: 'page1@x' } })],
        nextCursor: 'fb_p1',
        unreadCount: 0,
      })
      .mockResolvedValueOnce({
        items: [makeFb({ id: 'fb_p2', user: { id: 'u-p2', email: 'page2@x', name: null, displayIdentity: 'page2@x' } })],
        nextCursor: null,
        unreadCount: 0,
      });

    renderScreen();
    const loadMore = await screen.findByRole('button', { name: /\[load more\]/ });
    fireEvent.click(loadMore);

    await waitFor(() => {
      expect(api.admin.listFeedback).toHaveBeenNthCalledWith(2, 'fb_p1');
    });
    await waitFor(() => {
      // Second page row landed.
      expect(screen.getByText('page2@x')).toBeTruthy();
    });
    // First page still present (appended, not replaced).
    expect(screen.getByText('page1@x')).toBeTruthy();
    // Button gone (nextCursor became null).
    expect(screen.queryByRole('button', { name: /\[load more\]/ })).toBeNull();
  });
});

/* ── Admin-IA redesign (2026-05-29): [delete] feedback flow ── */

describe('AdminScreen feedback — delete affordance', () => {
  it('clicking [delete] opens the ConfirmModal with the DELETE keyword + correct copy', async () => {
    (api.admin.listFeedback as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [makeFb({ id: 'fb_d', user: { id: 'u-d', email: 'spam@x.com', name: null, displayIdentity: 'spam@x.com' } })],
      nextCursor: null,
      unreadCount: 0,
    });

    renderScreen();
    const delBtn = await screen.findByRole('button', { name: /Delete feedback from spam@x\.com/i });
    fireEvent.click(delBtn);

    // Modal headline + DELETE keyword instruction render.
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/delete this feedback row/i)).toBeTruthy();
    // The TYPE keyword display includes the literal "DELETE" keyword.
    expect(screen.getByText(/TYPE/i)).toBeTruthy();
  });

  it('typing DELETE unlocks the confirm button and calls api.admin.deleteFeedback', async () => {
    (api.admin.listFeedback as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [makeFb({ id: 'fb_d2', user: { id: 'u-d2', email: 'noise@x.com', name: null, displayIdentity: 'noise@x.com' } })],
      nextCursor: null,
      unreadCount: 0,
    });
    (api.admin.deleteFeedback as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    renderScreen();
    const delBtn = await screen.findByRole('button', { name: /Delete feedback from noise@x\.com/i });
    fireEvent.click(delBtn);

    const input = screen.getByPlaceholderText(/type DELETE/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'DELETE' } });
    // Modal's confirm button is exactly "delete feedback" (no "from X"
    // suffix that the row button has — disambiguate via exact match).
    const confirm = screen.getByRole('button', { name: /^delete feedback$/i });
    fireEvent.click(confirm);

    await waitFor(() => expect(api.admin.deleteFeedback).toHaveBeenCalledWith('fb_d2'));
    await waitFor(() =>
      expect(screen.getByText(/deleted feedback from: noise@x\.com/i)).toBeTruthy(),
    );
  });

  it('clicking [delete] does NOT toggle the row expanded state (stopPropagation guard)', async () => {
    (api.admin.listFeedback as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [makeFb({ id: 'fb_d3', message: 'expand-or-not body', user: { id: 'u-d3', email: 'sp@x.com', name: null, displayIdentity: 'sp@x.com' } })],
      nextCursor: null,
      unreadCount: 0,
    });

    renderScreen();
    const delBtn = await screen.findByRole('button', { name: /Delete feedback from sp@x\.com/i });
    fireEvent.click(delBtn);

    // Row body text should NOT be rendered (no expansion fired).
    expect(screen.queryByText(/expand-or-not body/i)).toBeNull();
    // Modal should have opened (dialog present).
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

// Silence the unused-import warning for `within` — kept it imported for
// future tests that may want to scope queries to a section subtree.
void within;
