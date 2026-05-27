import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useBreakpoint } from './hooks/useBreakpoint';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineBanner } from './components/layout/OfflineBanner';
import { RequireAuth } from './components/RequireAuth';
import { RequireActive } from './components/RequireActive';
import { AppShell } from './components/layout/AppShell';
import { UserProvider } from './contexts/UserContext';
import { PreferencesProvider } from './contexts/PreferencesContext';
import { SearchModalProvider } from './hooks/useSearchModal';

// Lazy-load each screen so the initial JS bundle ships only the shell + the
// first visible route. Suspense falls back to the same noise placeholder
// `RequireAuth` uses, so the transition is visually identical.
const lazyNamed = <K extends string, T>(
  loader: () => Promise<Record<K, T>>,
  key: K,
) => lazy(() => loader().then((m) => ({ default: m[key] as React.ComponentType })));

const LoginScreen           = lazyNamed(() => import('./components/screens/LoginScreen'),           'LoginScreen');
const WelcomeScreen         = lazyNamed(() => import('./components/screens/WelcomeScreen'),         'WelcomeScreen');
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
const GogGuidedFlowDesktop  = lazyNamed(() => import('./components/screens/GogGuidedFlowDesktop'),  'GogGuidedFlowDesktop');
const GogGuidedFlowMobile   = lazyNamed(() => import('./components/screens/GogGuidedFlowMobile'),   'GogGuidedFlowMobile');
const AdminScreen           = lazyNamed(() => import('./components/screens/AdminScreen'),           'AdminScreen');

function SuspenseFallback() {
  return <div className="hoard-noise" style={{ minHeight: '100vh' }} />;
}

export default function App() {
  const bp = useBreakpoint();
  const desktop = bp === 'desktop';

  return (
    <UserProvider>
      <PreferencesProvider>
        {/* R2 (PSN mobile guided-flow fix, 2026-05-21): SearchModalProvider
            lives here, NOT inside AppShell, so it wraps full-bleed routes
            (the /connect guided flows) that intentionally mount outside
            AppShell. The provider is pure context with no rendering output
            — zero cost when no consumer mounts. Closes the
            "useSearchModal must be used inside <SearchModalProvider>"
            render error that blocked Gaetano on mobile PSN connect (O12). */}
        <SearchModalProvider>
        <OfflineBanner />
        <ErrorBoundary>
          <Suspense fallback={<SuspenseFallback />}>
            <Routes>
              <Route path="/login" element={<LoginScreen />} />

              {/* Welcome screen (closed-beta gate, docs/INVITE_CODES_PLAN.md I4)
                  is authed but NOT active-gated — pending users have to be able
                  to reach it without bouncing in a redirect loop. */}
              <Route element={<RequireAuth><Outlet /></RequireAuth>}>
                <Route path="/welcome" element={<WelcomeScreen />} />
              </Route>

              {/* Authed + active routes inside the persistent shell. RequireActive
                  redirects pending users to `/welcome?next=<original-path>` so
                  they land back where they were trying to go after redemption. */}
              <Route element={<RequireAuth><RequireActive><AppShell /></RequireActive></RequireAuth>}>
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
                {/* Admin panel — desktop-only per I-D3. The component
                    handles its own breakpoint check + non-admin 404
                    fallback (defense-in-depth alongside requireAdmin
                    server-side and the Sidebar conditional entry). */}
                <Route path="/admin"                            element={<AdminScreen />} />
              </Route>

              {/* Authed + active full-screen routes (no app shell).
                  Explicit per-platform routes so each guided flow is its
                  own bundle and routing is unambiguous — adding XB or
                  another flow later is one more `<Route>`. */}
              <Route element={<RequireAuth><RequireActive><Outlet /></RequireActive></RequireAuth>}>
                <Route path="/settings/platforms/ps/connect" element={desktop ? <PsnGuidedFlowDesktop /> : <PsnGuidedFlowMobile />} />
                <Route path="/settings/platforms/gg/connect" element={desktop ? <GogGuidedFlowDesktop /> : <GogGuidedFlowMobile />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
        </SearchModalProvider>
      </PreferencesProvider>
    </UserProvider>
  );
}
