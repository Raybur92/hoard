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

vi.mock('../../../lib/api', () => ({
  api: {
    me: vi.fn().mockRejectedValue(new Error('test: no user')),
    platformStatus: vi.fn().mockResolvedValue({ platforms: [] }),
    gameCounts: vi.fn().mockResolvedValue({ counts: {} }),
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
      <MemoryRouter><TopBar crumbs={['hoard', 'Library']} /></MemoryRouter>,
    );
    expect(container.querySelector('.topbar')).toBeTruthy();
  });

  it('renders crumbs', () => {
    const { getByText } = render(
      <MemoryRouter><TopBar crumbs={['hoard', 'Library']} /></MemoryRouter>,
    );
    expect(getByText('hoard')).toBeTruthy();
    expect(getByText('Library')).toBeTruthy();
  });
});

describe('MobileFrame', () => {
  it('renders children', () => {
    const { getByText } = render(
      <MobileFrame><div>content</div></MobileFrame>,
    );
    expect(getByText('content')).toBeTruthy();
  });

  it('renders status bar', () => {
    const { container } = render(
      <MobileFrame><div /></MobileFrame>,
    );
    expect(container.querySelector('.m-status')).toBeTruthy();
  });
});

describe('MobileTabBar', () => {
  it('renders 4 tabs', () => {
    const { container } = render(
      <MemoryRouter><MobileTabBar /></MemoryRouter>,
    );
    expect(container.querySelectorAll('.item')).toHaveLength(4);
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
    const { getByText } = render(<MobileHeader title="Library" />);
    expect(getByText('Library')).toBeTruthy();
  });

  it('renders subtitle when provided', () => {
    const { getByText } = render(<MobileHeader title="Library" sub="286 games" />);
    expect(getByText('286 games')).toBeTruthy();
  });
});
