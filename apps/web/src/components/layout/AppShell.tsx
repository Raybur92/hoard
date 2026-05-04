import { Outlet } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { Sidebar } from './Sidebar';
import { MobileFrame } from './MobileFrame';
import { MobileTabBar } from './MobileTabBar';

export function AppShell() {
  const bp = useBreakpoint();

  if (bp === 'desktop') {
    return (
      <div className="app-shell hoard-noise">
        <Sidebar />
        <div className="app-main">
          <Outlet />
        </div>
      </div>
    );
  }

  return (
    <MobileFrame>
      <Outlet />
      <MobileTabBar />
    </MobileFrame>
  );
}
