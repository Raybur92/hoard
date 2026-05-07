import { Outlet } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useAutoSync } from '../../hooks/useAutoSync';
import { SearchModalProvider } from '../../hooks/useSearchModal';
import { Sidebar } from './Sidebar';
import { MobileFrame } from './MobileFrame';
import { MobileTabBar } from './MobileTabBar';

export function AppShell() {
  const bp = useBreakpoint();
  // Background polling — triggers POST /api/platforms/:code/sync on any
  // platform whose `lastSyncAt` is older than its `syncFrequency` window.
  // See apps/web/src/hooks/useAutoSync.ts for the cadence rules.
  useAutoSync();

  return (
    <SearchModalProvider>
      <a className="skip-link" href="#main-content">Skip to content</a>
      {bp === 'desktop' ? (
        <div className="app-shell hoard-noise">
          <Sidebar />
          <main id="main-content" className="app-main">
            <Outlet />
          </main>
        </div>
      ) : (
        <MobileFrame>
          <main id="main-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            <Outlet />
          </main>
          <MobileTabBar />
        </MobileFrame>
      )}
    </SearchModalProvider>
  );
}
