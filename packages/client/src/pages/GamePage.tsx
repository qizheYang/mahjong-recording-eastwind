import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores/game-store';
import { ScoreBoard } from '../components/game/ScoreBoard';
import { HandHistory } from '../components/game/HandHistory';
import { RecordHandModal } from '../components/game/RecordHandModal';
import { formatRound } from '../lib/format';
import { isAllLastHand } from '@mahjong/shared';
import type { HandResultInput } from '@mahjong/shared';

export function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const {
    room, game, finalScores, playerId, connected,
    connect, setSession,
    recordHand, undoLastHand, endGame, error, clearError,
  } = useGameStore();

  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);

  // Restore session
  useEffect(() => {
    const storedRoom = sessionStorage.getItem('roomCode');
    const storedPlayer = sessionStorage.getItem('playerId');
    if (storedRoom === roomCode && storedPlayer && !playerId) {
      setSession(storedRoom, storedPlayer);
    }
  }, [roomCode, playerId, setSession]);

  // Connect (no disconnect on unmount — connection persists across pages)
  useEffect(() => {
    if (roomCode && playerId) {
      connect();
    }
  }, [roomCode, playerId, connect]);

  // Redirect to results when game ends
  useEffect(() => {
    if (finalScores) {
      navigate(`/results/${roomCode}`);
    }
  }, [finalScores, roomCode, navigate]);

  // Redirect to lobby if no game
  useEffect(() => {
    if (connected && room && !game) {
      navigate(`/lobby/${roomCode}`);
    }
  }, [connected, room, game, roomCode, navigate]);

  function handleRecordHand(result: HandResultInput) {
    recordHand(result);
    setShowRecordModal(false);
  }

  function handleUndo() {
    if (confirmUndo) {
      undoLastHand();
      setConfirmUndo(false);
    } else {
      setConfirmUndo(true);
      setTimeout(() => setConfirmUndo(false), 3000);
    }
  }

  if (!connected || !game) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-mahjong-muted">连接中... Connecting...</p>
      </div>
    );
  }

  const isAllLast = isAllLastHand(game);

  return (
    <div className="min-h-dvh flex flex-col p-4 max-w-md mx-auto">
      {/* Error toast */}
      {error && (
        <div className="fixed top-4 left-4 right-4 z-50 bg-mahjong-highlight text-white
          rounded-lg p-3 text-sm flex items-center justify-between"
          onClick={clearError}
        >
          <span>{error}</span>
          <span className="text-xs ml-2">✕</span>
        </div>
      )}

      {/* Round indicator */}
      <div className="text-center mb-4">
        <div className="flex items-center justify-center gap-3">
          <span className="text-2xl font-bold text-mahjong-gold">
            {formatRound(game.currentRound)}
          </span>
          {isAllLast && (
            <span className="text-xs bg-mahjong-highlight text-white px-2 py-0.5 rounded">
              All Last
            </span>
          )}
        </div>
        <div className="flex items-center justify-center gap-4 text-sm text-mahjong-muted mt-1">
          {game.honbaCount > 0 && (
            <span>{game.honbaCount}本場</span>
          )}
          {game.riichiSticks > 0 && (
            <span>{game.riichiSticks}供託</span>
          )}
          {game.honbaCount === 0 && game.riichiSticks === 0 && (
            <span>0本場</span>
          )}
        </div>
      </div>

      {/* Score board */}
      <ScoreBoard
        players={game.players}
        currentDealer={game.currentDealer}
        currentRoundWind={game.currentRound.wind}
      />

      {/* Action buttons */}
      <div className="mt-6 space-y-3">
        <button
          onClick={() => setShowRecordModal(true)}
          className="w-full py-4 rounded-xl bg-mahjong-green text-mahjong-bg font-bold text-xl
            active:scale-[0.98] transition-transform"
        >
          记录本局 Record Hand
        </button>

        <div className="flex gap-2">
          <button
            onClick={handleUndo}
            disabled={game.hands.length === 0}
            className="flex-1 py-2 rounded-lg bg-mahjong-card text-mahjong-muted text-sm
              disabled:opacity-30 active:scale-[0.98] transition-transform"
          >
            {confirmUndo ? '确认撤销? Confirm?' : '撤销 Undo'}
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex-1 py-2 rounded-lg bg-mahjong-card text-mahjong-muted text-sm
              active:scale-[0.98] transition-transform"
          >
            {showHistory ? '隐藏记录 Hide' : `记录 History (${game.hands.length})`}
          </button>
        </div>
      </div>

      {/* Hand history */}
      {showHistory && (
        <div className="mt-4">
          <HandHistory hands={game.hands} players={game.players} />
        </div>
      )}

      {/* Record hand modal */}
      {showRecordModal && (
        <RecordHandModal
          players={game.players}
          currentDealer={game.currentDealer}
          honbaCount={game.honbaCount}
          riichiSticks={game.riichiSticks}
          onSubmit={handleRecordHand}
          onClose={() => setShowRecordModal(false)}
        />
      )}
    </div>
  );
}
