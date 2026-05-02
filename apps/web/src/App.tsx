import { Routes, Route, Navigate } from 'react-router-dom';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<div>Dashboard — coming in Phase 2</div>} />
      <Route path="/library" element={<div>Library — coming in Phase 2</div>} />
      <Route path="/library/:status" element={<div>Library filtered — coming in Phase 2</div>} />
      <Route path="/upcoming" element={<div>Upcoming — coming in Phase 2</div>} />
      <Route path="/game/:id" element={<div>Game detail — coming in Phase 2</div>} />
      <Route path="/settings" element={<div>Settings — coming in Phase 4</div>} />
      <Route path="/login" element={<div>Login — coming in Phase 4</div>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
