import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const mockUser = vi.fn();
vi.mock('../../contexts/UserContext', () => ({
  useUser: () => mockUser(),
}));

import { RequireActive } from '../RequireActive';

function Capture({ onChange }: { onChange: (path: string) => void }) {
  const loc = useLocation();
  onChange(loc.pathname + loc.search);
  return null;
}

function renderAt(initial: string) {
  let lastPath = initial;
  render(
    <MemoryRouter initialEntries={[initial]}>
      <Capture onChange={(p) => { lastPath = p; }} />
      <Routes>
        <Route
          path="*"
          element={
            <RequireActive>
              <div data-testid="children">protected content</div>
            </RequireActive>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  return () => lastPath;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RequireActive', () => {
  it('renders the noise placeholder while user context is loading', () => {
    mockUser.mockReturnValue({ user: null, status: 'loading', setUser: vi.fn(), signOut: vi.fn(), refresh: vi.fn() });
    renderAt('/library');
    expect(screen.queryByTestId('children')).toBeNull();
  });

  it('passes ACTIVE users through to the children', () => {
    mockUser.mockReturnValue({
      user: { id: 'u', email: 'a@x.com', name: null, createdAt: '', status: 'ACTIVE', isAdmin: false, hasRequestedAccess: false, preferences: { hypeThreshold: 5, libraryView: 'shelves', showHltb: true, coverDensity: 'standard', terminalCursor: true } },
      status: 'authed', setUser: vi.fn(), signOut: vi.fn(), refresh: vi.fn(),
    });
    renderAt('/library');
    expect(screen.getByTestId('children')).toBeTruthy();
  });

  it('redirects PENDING_INVITE users to /welcome with the original path encoded as next', () => {
    mockUser.mockReturnValue({
      user: { id: 'u', email: 'a@x.com', name: null, createdAt: '', status: 'PENDING_INVITE', isAdmin: false, hasRequestedAccess: false, preferences: { hypeThreshold: 5, libraryView: 'shelves', showHltb: true, coverDensity: 'standard', terminalCursor: true } },
      status: 'authed', setUser: vi.fn(), signOut: vi.fn(), refresh: vi.fn(),
    });
    const getPath = renderAt('/library/Backlog');
    // path + search are URL-encoded into next
    expect(getPath()).toBe('/welcome?next=%2Flibrary%2FBacklog');
    expect(screen.queryByTestId('children')).toBeNull();
  });

  it('preserves search params in the next param', () => {
    mockUser.mockReturnValue({
      user: { id: 'u', email: 'a@x.com', name: null, createdAt: '', status: 'PENDING_INVITE', isAdmin: false, hasRequestedAccess: false, preferences: { hypeThreshold: 5, libraryView: 'shelves', showHltb: true, coverDensity: 'standard', terminalCursor: true } },
      status: 'authed', setUser: vi.fn(), signOut: vi.fn(), refresh: vi.fn(),
    });
    const getPath = renderAt('/library?sort=playtime');
    expect(getPath()).toBe('/welcome?next=%2Flibrary%3Fsort%3Dplaytime');
  });
});
