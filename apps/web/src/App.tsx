import { Routes, Route, Navigate } from 'react-router-dom';
import { useBreakpoint } from './hooks/useBreakpoint';
import {
  DashboardDesktop, DashboardMobile,
  LibraryDesktop, LibraryMobile,
  UpcomingDesktop, UpcomingMobile,
  GameDetailDesktop, GameDetailMobile,
  SettingsDesktop, SettingsMobile,
  PlatformDetailDesktop, PlatformDetailMobile,
  PsnGuidedFlowDesktop, PsnGuidedFlowMobile,
  LoginScreen,
} from './components/screens';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineBanner } from './components/layout/OfflineBanner';
import { RequireAuth } from './components/RequireAuth';
import { PreferencesProvider } from './contexts/PreferencesContext';

export default function App() {
  const bp = useBreakpoint();
  const desktop = bp === 'desktop';

  return (
    <PreferencesProvider>
      <OfflineBanner />
      <ErrorBoundary>
        <Routes>
          <Route path="/login"                               element={<LoginScreen />} />
          <Route path="/"                                    element={<RequireAuth>{desktop ? <DashboardDesktop />      : <DashboardMobile />}</RequireAuth>} />
          <Route path="/library"                             element={<RequireAuth>{desktop ? <LibraryDesktop />        : <LibraryMobile />}</RequireAuth>} />
          <Route path="/library/:status"                     element={<RequireAuth>{desktop ? <LibraryDesktop />        : <LibraryMobile />}</RequireAuth>} />
          <Route path="/upcoming"                            element={<RequireAuth>{desktop ? <UpcomingDesktop />       : <UpcomingMobile />}</RequireAuth>} />
          <Route path="/game/:id"                            element={<RequireAuth>{desktop ? <GameDetailDesktop />     : <GameDetailMobile />}</RequireAuth>} />
          <Route path="/settings"                            element={<RequireAuth>{desktop ? <SettingsDesktop />       : <SettingsMobile />}</RequireAuth>} />
          <Route path="/settings/:section"                   element={<RequireAuth>{desktop ? <SettingsDesktop />       : <SettingsMobile />}</RequireAuth>} />
          <Route path="/settings/platforms/:code"            element={<RequireAuth>{desktop ? <PlatformDetailDesktop /> : <PlatformDetailMobile />}</RequireAuth>} />
          <Route path="/settings/platforms/:code/connect"    element={<RequireAuth>{desktop ? <PsnGuidedFlowDesktop />  : <PsnGuidedFlowMobile />}</RequireAuth>} />
          <Route path="*"                                    element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </PreferencesProvider>
  );
}
