import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { LobbyPage } from './pages/LobbyPage';
import { GamePage } from './pages/GamePage';
import { ResultsPage } from './pages/ResultsPage';
import { HistoryPage } from './pages/HistoryPage';
import { PlayerPage } from './pages/PlayerPage';
import { I18nProvider, LanguageSelector } from './i18n';

const BASE = import.meta.env.BASE_URL;

export function App() {
  return (
    <I18nProvider>
      <BrowserRouter basename={BASE}>
        <div className="fixed top-3 right-3 z-40">
          <LanguageSelector />
        </div>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/lobby/:roomCode" element={<LobbyPage />} />
          <Route path="/game/:roomCode" element={<GamePage />} />
          <Route path="/results/:roomCode" element={<ResultsPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/player/:name" element={<PlayerPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </I18nProvider>
  );
}
