import { Routes, Route, Navigate } from 'react-router-dom';
import { useBreakpoint } from './hooks/useBreakpoint';
import {
  DashboardDesktop, DashboardMobile,
  LibraryDesktop, LibraryMobile,
  UpcomingDesktop, UpcomingMobile,
  GameDetailDesktop, GameDetailMobile,
} from './components/screens';

export default function App() {
  const bp = useBreakpoint();
  const desktop = bp === 'desktop';

  return (
    <Routes>
      <Route path="/"                element={desktop ? <DashboardDesktop /> : <DashboardMobile />} />
      <Route path="/library"         element={desktop ? <LibraryDesktop />   : <LibraryMobile />} />
      <Route path="/library/:status" element={desktop ? <LibraryDesktop />   : <LibraryMobile />} />
      <Route path="/upcoming"        element={desktop ? <UpcomingDesktop />  : <UpcomingMobile />} />
      <Route path="/game/:id"        element={desktop ? <GameDetailDesktop /> : <GameDetailMobile />} />
      <Route path="/settings"        element={<div style={{ padding: 40, color: 'var(--paper-faint)', fontFamily: 'var(--mono)' }}>Settings — coming in Phase 4</div>} />
      <Route path="/login"           element={<div style={{ padding: 40, color: 'var(--paper-faint)', fontFamily: 'var(--mono)' }}>Login — coming in Phase 4</div>} />
      <Route path="*"                element={<Navigate to="/" replace />} />
    </Routes>
  );
}
