import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { LobbyPage } from './pages/LobbyPage';
import { GamePage } from './pages/GamePage';
import { ResultsPage } from './pages/ResultsPage';

const BASE = import.meta.env.BASE_URL;

export function App() {
  return (
    <BrowserRouter basename={BASE}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/lobby/:roomCode" element={<LobbyPage />} />
        <Route path="/game/:roomCode" element={<GamePage />} />
        <Route path="/results/:roomCode" element={<ResultsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
