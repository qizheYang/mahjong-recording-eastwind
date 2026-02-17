import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores/game-store';
import { formatPoints, formatGameScore } from '../lib/format';

const PLACEMENT_COLORS = ['text-mahjong-gold', 'text-white', 'text-mahjong-muted', 'text-mahjong-highlight'];
const PLACEMENT_LABELS = ['1st', '2nd', '3rd', '4th'];

export function ResultsPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const {
    game, finalScores, playerId, connected,
    connect, setSession, resetForNewGame,
  } = useGameStore();

  // Restore session
  useEffect(() => {
    const storedRoom = sessionStorage.getItem('roomCode');
    const storedPlayer = sessionStorage.getItem('playerId');
    if (storedRoom === roomCode && storedPlayer && !playerId) {
      setSession(storedRoom, storedPlayer);
    }
  }, [roomCode, playerId, setSession]);

  // Connect if needed (no disconnect on unmount — connection persists across pages)
  useEffect(() => {
    if (roomCode && playerId) {
      connect();
    }
  }, [roomCode, playerId, connect]);

  function handleNewGame() {
    resetForNewGame();
    navigate(`/lobby/${roomCode}`);
  }

  function handleShare() {
    if (!finalScores || !game) return;
    const lines = [
      `🀄 麻雀記録 - 対局結果`,
      `${game.hands.length} hands played`,
      '',
      ...finalScores.map((s, i) => {
        const rank = PLACEMENT_LABELS[s.placement - 1];
        return `${rank} ${s.name}: ${formatPoints(s.rawPoints)}点 (${formatGameScore(s.gameScore)})`;
      }),
    ];
    navigator.clipboard.writeText(lines.join('\n'));
  }

  if (!finalScores) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="text-center">
          <p className="text-mahjong-muted mb-4">暂无结果 No results yet</p>
          <button
            onClick={() => navigate(`/game/${roomCode}`)}
            className="px-6 py-2 rounded-lg bg-mahjong-accent text-white"
          >
            返回对局 Back to Game
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col p-4 max-w-md mx-auto">
      <div className="text-center my-6">
        <h1 className="text-3xl font-bold mb-1">対局結果</h1>
        <p className="text-mahjong-muted text-sm">Game Results</p>
        {game && (
          <p className="text-mahjong-muted text-xs mt-1">{game.hands.length} hands played</p>
        )}
      </div>

      {/* Results table */}
      <div className="space-y-3 mb-8">
        {finalScores.map((score, i) => (
          <div
            key={score.playerIndex}
            className={`relative rounded-xl p-4 ${
              i === 0 ? 'bg-mahjong-accent ring-2 ring-mahjong-gold' : 'bg-mahjong-card'
            }`}
          >
            {/* Placement badge */}
            <div className="flex items-start justify-between">
              <div>
                <span className={`text-3xl font-bold ${PLACEMENT_COLORS[score.placement - 1]}`}>
                  {score.placement}
                </span>
                <span className="text-mahjong-muted text-sm ml-1">
                  {PLACEMENT_LABELS[score.placement - 1]}
                </span>
              </div>
              <div className="text-right">
                <p className={`text-2xl font-bold font-mono ${
                  score.gameScore >= 0 ? 'text-mahjong-green' : 'text-mahjong-highlight'
                }`}>
                  {formatGameScore(score.gameScore)}
                </p>
                <p className="text-xs text-mahjong-muted">game score</p>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between">
              <p className="font-medium text-lg">{score.name}</p>
              <div className="text-right text-sm">
                <span className="text-mahjong-muted">{formatPoints(score.rawPoints)}点</span>
                <span className="text-mahjong-muted ml-2">uma {score.uma > 0 ? '+' : ''}{score.uma}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="mt-auto space-y-3 pb-4">
        <button
          onClick={handleShare}
          className="w-full py-3 rounded-xl bg-mahjong-accent text-white font-bold
            active:scale-[0.98] transition-transform"
        >
          复制结果 Copy Results
        </button>
        <button
          onClick={handleNewGame}
          className="w-full py-3 rounded-xl bg-mahjong-green text-mahjong-bg font-bold
            active:scale-[0.98] transition-transform"
        >
          新对局 New Game
        </button>
        <button
          onClick={() => navigate('/')}
          className="w-full py-2 text-mahjong-muted text-sm"
        >
          返回首页 Back to Home
        </button>
      </div>
    </div>
  );
}
