import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useBreakpoint } from './hooks/useBreakpoint';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineBanner } from './components/layout/OfflineBanner';
import { RequireAuth } from './components/RequireAuth';
import { AppShell } from './components/layout/AppShell';
import { UserProvider } from './contexts/UserContext';
import { PreferencesProvider } from './contexts/PreferencesContext';

// Lazy-load each screen so the initial JS bundle ships only the shell + the
// first visible route. Suspense falls back to the same noise placeholder
// `RequireAuth` uses, so the transition is visually identical.
const lazyNamed = <K extends string, T>(
  loader: () => Promise<Record<K, T>>,
  key: K,
) => lazy(() => loader().then((m) => ({ default: m[key] as React.ComponentType })));

const LoginScreen           = lazyNamed(() => import('./components/screens/LoginScreen'),           'LoginScreen');
const DashboardDesktop      = lazyNamed(() => import('./components/screens/DashboardDesktop'),      'DashboardDesktop');
const DashboardMobile       = lazyNamed(() => import('./components/screens/DashboardMobile'),       'DashboardMobile');
const LibraryDesktop        = lazyNamed(() => import('./components/screens/LibraryDesktop'),        'LibraryDesktop');
const LibraryMobile         = lazyNamed(() => import('./components/screens/LibraryMobile'),         'LibraryMobile');
const ReleasesDesktop       = lazyNamed(() => import('./components/screens/ReleasesDesktop'),       'ReleasesDesktop');
const ReleasesMobile        = lazyNamed(() => import('./components/screens/ReleasesMobile'),        'ReleasesMobile');
const ReleasesRecentDesktop = lazyNamed(() => import('./components/screens/ReleasesRecentDesktop'), 'ReleasesRecentDesktop');
const ReleasesRecentMobile  = lazyNamed(() => import('./components/screens/ReleasesRecentMobile'),  'ReleasesRecentMobile');
const GameDetailDesktop     = lazyNamed(() => import('./components/screens/GameDetailDesktop'),     'GameDetailDesktop');
const GameDetailMobile      = lazyNamed(() => import('./components/screens/GameDetailMobile'),      'GameDetailMobile');
const SettingsDesktop       = lazyNamed(() => import('./components/screens/SettingsDesktop'),       'SettingsDesktop');
const SettingsMobile        = lazyNamed(() => import('./components/screens/SettingsMobile'),        'SettingsMobile');
const PlatformDetailDesktop = lazyNamed(() => import('./components/screens/PlatformDetailDesktop'), 'PlatformDetailDesktop');
const PlatformDetailMobile  = lazyNamed(() => import('./components/screens/PlatformDetailMobile'),  'PlatformDetailMobile');
const PsnGuidedFlowDesktop  = lazyNamed(() => import('./components/screens/PsnGuidedFlowDesktop'),  'PsnGuidedFlowDesktop');
const PsnGuidedFlowMobile   = lazyNamed(() => import('./components/screens/PsnGuidedFlowMobile'),   'PsnGuidedFlowMobile');

function SuspenseFallback() {
  return <div className="hoard-noise" style={{ minHeight: '100vh' }} />;
}

export default function App() {
  const bp = useBreakpoint();
  const desktop = bp === 'desktop';

  return (
    <UserProvider>
      <PreferencesProvider>
        <OfflineBanner />
        <ErrorBoundary>
          <Suspense fallback={<SuspenseFallback />}>
            <Routes>
              <Route path="/login" element={<LoginScreen />} />

              {/* Authed routes inside the persistent shell */}
              <Route element={<RequireAuth><AppShell /></RequireAuth>}>
                <Route path="/"                                 element={desktop ? <DashboardDesktop />      : <DashboardMobile />} />
                <Route path="/library"                          element={desktop ? <LibraryDesktop />        : <LibraryMobile />} />
                <Route path="/library/:status"                  element={desktop ? <LibraryDesktop />        : <LibraryMobile />} />
                {/* Releases page rework (R3 desktop, R5 mobile) — `/releases`
                    is the canonical URL; `/upcoming` redirects below for
                    compatibility with old shared links. Mobile uses the
                    view-sheet IA (handoff §7) — see `ReleasesMobile`. */}
                <Route path="/releases"                         element={desktop ? <ReleasesDesktop />       : <ReleasesMobile />} />
                <Route path="/releases/recent"                  element={desktop ? <ReleasesRecentDesktop /> : <ReleasesRecentMobile />} />
                <Route path="/upcoming"                         element={<Navigate to="/releases" replace />} />
                <Route path="/game/:id"                         element={desktop ? <GameDetailDesktop />     : <GameDetailMobile />} />
                <Route path="/settings"                         element={desktop ? <SettingsDesktop />       : <SettingsMobile />} />
                <Route path="/settings/:section"                element={desktop ? <SettingsDesktop />       : <SettingsMobile />} />
                <Route path="/settings/platforms/:code"         element={desktop ? <PlatformDetailDesktop /> : <PlatformDetailMobile />} />
              </Route>

              {/* Authed routes that render their own full-screen wrapper (no app shell) */}
              <Route element={<RequireAuth><Outlet /></RequireAuth>}>
                <Route path="/settings/platforms/:code/connect" element={desktop ? <PsnGuidedFlowDesktop />  : <PsnGuidedFlowMobile />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </PreferencesProvider>
    </UserProvider>
  );
}
