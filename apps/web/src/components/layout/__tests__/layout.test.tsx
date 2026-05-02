import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../Sidebar';
import { TopBar } from '../TopBar';
import { MobileFrame } from '../MobileFrame';
import { MobileTabBar } from '../MobileTabBar';
import { MobileHeader } from '../MobileHeader';

describe('Sidebar', () => {
  it('renders without throwing', () => {
    const { container } = render(
      <MemoryRouter><Sidebar /></MemoryRouter>,
    );
    expect(container.querySelector('.sidebar')).toBeTruthy();
  });

  it('marks active route', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/library']}><Sidebar /></MemoryRouter>,
    );
    const activeItem = container.querySelector('.item.active');
    expect(activeItem?.textContent).toContain('Library');
  });
});

describe('TopBar', () => {
  it('renders without throwing', () => {
    const { container } = render(<TopBar crumbs={['hoard', 'Library']} />);
    expect(container.querySelector('.topbar')).toBeTruthy();
  });

  it('renders crumbs', () => {
    const { getByText } = render(<TopBar crumbs={['hoard', 'Library']} />);
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
