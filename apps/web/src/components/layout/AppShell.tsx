import { Outlet } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { Sidebar } from './Sidebar';
import { MobileFrame } from './MobileFrame';
import { MobileTabBar } from './MobileTabBar';

// `SearchModalProvider` was previously mounted here. Lifted to `App.tsx`
// in R2 (2026-05-21) so it wraps full-bleed routes that mount outside
// AppShell (the `/connect` guided flows). See the App.tsx comment for
// the full rationale.
export function AppShell() {
  const bp = useBreakpoint();

  return (
    <>
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
    </>
  );
}
