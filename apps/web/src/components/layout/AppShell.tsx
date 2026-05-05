import { Outlet } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { SearchModalProvider } from '../../hooks/useSearchModal';
import { Sidebar } from './Sidebar';
import { MobileFrame } from './MobileFrame';
import { MobileTabBar } from './MobileTabBar';

export function AppShell() {
  const bp = useBreakpoint();

  return (
    <SearchModalProvider>
      {bp === 'desktop' ? (
        <div className="app-shell hoard-noise">
          <Sidebar />
          <div className="app-main">
            <Outlet />
          </div>
        </div>
      ) : (
        <MobileFrame>
          <Outlet />
          <MobileTabBar />
        </MobileFrame>
      )}
    </SearchModalProvider>
  );
}
