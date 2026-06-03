import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Sidebar } from '../Sidebar';
import { TopBar } from '../TopBar';
import { MobileFrame } from '../MobileFrame';
import { MobileTabBar } from '../MobileTabBar';
import { MobileHeader } from '../MobileHeader';
import { UserProvider } from '../../../contexts/UserContext';
import { SearchModalProvider } from '../../../hooks/useSearchModal';

vi.mock('../../../lib/api', () => ({
  api: {
    me: vi.fn().mockRejectedValue(new Error('test: no user')),
    platformStatus: vi.fn().mockResolvedValue({ platforms: [] }),
    gameCounts: vi.fn().mockResolvedValue({ counts: {} }),
    // B-IGDB-3b2 — Sidebar reads lens-index for the browse-by groups.
    lensIndex: vi.fn().mockResolvedValue({ genre: [], theme: [], perspective: [] }),
    logout: vi.fn().mockResolvedValue(undefined),
  },
}));

function withProviders(ui: ReactNode, route = '/') {
  return (
    <MemoryRouter initialEntries={[route]}>
      <UserProvider>{ui}</UserProvider>
    </MemoryRouter>
  );
}

describe('Sidebar', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders without throwing', () => {
    const { container } = render(withProviders(<Sidebar />));
    expect(container.querySelector('.sidebar')).toBeTruthy();
  });

  it('marks active route', () => {
    const { container } = render(withProviders(<Sidebar />, '/library'));
    const activeItem = container.querySelector('.item.active');
    expect(activeItem?.textContent).toContain('Library');
  });
});

describe('TopBar', () => {
  it('renders without throwing', () => {
    const { container } = render(
      <MemoryRouter><SearchModalProvider><TopBar crumbs={['hoard', 'Library']} /></SearchModalProvider></MemoryRouter>,
    );
    expect(container.querySelector('.topbar')).toBeTruthy();
  });

  it('renders crumbs', () => {
    const { getByText, getAllByText } = render(
      <MemoryRouter><SearchModalProvider><TopBar crumbs={['hoard', 'Library']} /></SearchModalProvider></MemoryRouter>,
    );
    expect(getByText('hoard')).toBeTruthy();
    // "Library" appears twice: once in the visible breadcrumb, once in the
    // sr-only <h1> (Phase 8 PR 3 part 2 — semantic page heading).
    expect(getAllByText('Library').length).toBeGreaterThanOrEqual(1);
  });
});

describe('MobileFrame', () => {
  it('renders children', () => {
    const { getByText } = render(
      <MobileFrame><div>content</div></MobileFrame>,
    );
    expect(getByText('content')).toBeTruthy();
  });

  it('uses the .app-mobile container', () => {
    const { container } = render(
      <MobileFrame><div /></MobileFrame>,
    );
    expect(container.querySelector('.app-mobile')).toBeTruthy();
  });
});

describe('MobileTabBar', () => {
  it('renders 5 tabs (Dash / Library / Soon / Events / Deals per EV-D14)', () => {
    const { container } = render(
      <MemoryRouter><MobileTabBar /></MemoryRouter>,
    );
    expect(container.querySelectorAll('.item')).toHaveLength(5);
  });

  it('marks active tab', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/library']}><MobileTabBar /></MemoryRouter>,
    );
    expect(container.querySelector('.item.active')?.textContent).toContain('Library');
  });
});

describe('MobileHeader', () => {
  it('renders title', () => {
    const { getByText } = render(
      <MemoryRouter><SearchModalProvider><MobileHeader title="Library" /></SearchModalProvider></MemoryRouter>,
    );
    expect(getByText('Library')).toBeTruthy();
  });

  it('renders subtitle when provided', () => {
    const { getByText } = render(
      <MemoryRouter><SearchModalProvider><MobileHeader title="Library" sub="286 games" /></SearchModalProvider></MemoryRouter>,
    );
    expect(getByText('286 games')).toBeTruthy();
  });
});
