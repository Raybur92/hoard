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
import { PreferencesProvider } from './contexts/PreferencesContext';

export default function App() {
  const bp = useBreakpoint();
  const desktop = bp === 'desktop';

  return (
    <PreferencesProvider>
      <OfflineBanner />
      <ErrorBoundary>
        <Routes>
          <Route path="/"                                    element={desktop ? <DashboardDesktop />      : <DashboardMobile />} />
          <Route path="/library"                             element={desktop ? <LibraryDesktop />        : <LibraryMobile />} />
          <Route path="/library/:status"                     element={desktop ? <LibraryDesktop />        : <LibraryMobile />} />
          <Route path="/upcoming"                            element={desktop ? <UpcomingDesktop />       : <UpcomingMobile />} />
          <Route path="/game/:id"                            element={desktop ? <GameDetailDesktop />     : <GameDetailMobile />} />
          <Route path="/settings"                            element={desktop ? <SettingsDesktop />       : <SettingsMobile />} />
          <Route path="/settings/:section"                   element={desktop ? <SettingsDesktop />       : <SettingsMobile />} />
          <Route path="/settings/platforms/:code"            element={desktop ? <PlatformDetailDesktop /> : <PlatformDetailMobile />} />
          <Route path="/settings/platforms/:code/connect"    element={desktop ? <PsnGuidedFlowDesktop />  : <PsnGuidedFlowMobile />} />
          <Route path="/login"                               element={<LoginScreen />} />
          <Route path="*"                                    element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </PreferencesProvider>
  );
}
