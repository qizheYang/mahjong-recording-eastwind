import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores/game-store';
import { ScoreBoard } from '../components/game/ScoreBoard';
import { HandHistory } from '../components/game/HandHistory';
import { RecordHandModal } from '../components/game/RecordHandModal';
import { formatRound } from '../lib/format';
import { isAllLastHand, M_LEAGUE_RULES } from '@mahjong/shared';
import type { HandResultInput } from '@mahjong/shared';
import { RulesIsland } from '../components/game/RulesIsland';
import { useLocale } from '../i18n';

export function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { t } = useLocale();
  const {
    room, game, finalScores, playerId, connected,
    connect, setSession,
    recordHand, undoLastHand, endGame, forceQuitGame, error, errorCode, clearError,
  } = useGameStore();

  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [showForceQuit, setShowForceQuit] = useState(false);

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
        <p className="text-mahjong-muted">{t('common.connecting')}</p>
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
          <span>{errorCode ? t(`error.${errorCode}`) : error}</span>
          <span className="text-xs ml-2">✕</span>
        </div>
      )}

      {/* Round indicator */}
      <div className="text-center mb-4">
        <div className="flex items-center justify-center gap-3">
          <span className="text-2xl font-bold text-mahjong-gold">
            {formatRound(game.currentRound, t)}
          </span>
          {isAllLast && (
            <span className="text-xs bg-mahjong-highlight text-white px-2 py-0.5 rounded">
              {t('mahjong.allLast')}
            </span>
          )}
        </div>
        <div className="flex items-center justify-center gap-4 text-sm text-mahjong-muted mt-1">
          {game.honbaCount > 0 && (
            <span>{game.honbaCount}{t('mahjong.honba')}</span>
          )}
          {game.riichiSticks > 0 && (
            <span>{game.riichiSticks}{t('mahjong.kyoutaku')}</span>
          )}
          {game.honbaCount === 0 && game.riichiSticks === 0 && (
            <span>0{t('mahjong.honba')}</span>
          )}
        </div>
      </div>

      {/* Score board */}
      <ScoreBoard
        players={game.players}
        currentDealer={game.currentDealer}
        currentRoundWind={game.currentRound.wind}
      />

      {/* Rules info bar */}
      <div className="mt-4">
        <RulesIsland
          startingPoints={game.ruleset?.startingPoints ?? M_LEAGUE_RULES.startingPoints}
          uma={game.ruleset?.uma ?? M_LEAGUE_RULES.uma}
          tobiEnabled={game.ruleset?.tobiEnabled ?? M_LEAGUE_RULES.tobiEnabled}
          okaEnabled={game.ruleset?.okaEnabled ?? M_LEAGUE_RULES.okaEnabled}
          scoreFormula={game.ruleset?.scoreFormula ?? M_LEAGUE_RULES.scoreFormula}
          editable={false}
        />
      </div>

      {/* Action buttons */}
      <div className="mt-6 space-y-3">
        <button
          onClick={() => setShowRecordModal(true)}
          className="w-full py-4 rounded-xl bg-mahjong-green text-mahjong-bg font-bold text-xl
            active:scale-[0.98] transition-transform"
        >
          {t('game.recordHand')}
        </button>

        <div className="flex gap-2">
          <button
            onClick={handleUndo}
            disabled={game.hands.length === 0}
            className="flex-1 py-2 rounded-lg bg-mahjong-card text-mahjong-muted text-sm
              disabled:opacity-30 active:scale-[0.98] transition-transform"
          >
            {confirmUndo ? t('game.confirmUndo') : t('game.undo')}
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex-1 py-2 rounded-lg bg-mahjong-card text-mahjong-muted text-sm
              active:scale-[0.98] transition-transform"
          >
            {showHistory ? t('game.hideHistory') : t('game.historyCount', { count: game.hands.length })}
          </button>
        </div>

        <button
          onClick={() => setShowForceQuit(true)}
          className="w-full py-2 rounded-lg text-mahjong-highlight/60 text-xs
            active:scale-[0.98] transition-transform"
        >
          {t('game.forceQuit')}
        </button>
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

      {/* Force quit modal */}
      {showForceQuit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowForceQuit(false)} />
          <div className="relative w-full max-w-xs bg-mahjong-bg rounded-2xl p-5 space-y-4">
            <h3 className="text-lg font-bold text-center text-mahjong-highlight">
              {t('game.forceQuitTitle')}
            </h3>
            <p className="text-sm text-mahjong-muted text-center">
              {t('game.forceQuitConfirm')}
            </p>
            <button
              onClick={() => { forceQuitGame(true); setShowForceQuit(false); }}
              className="w-full py-3 rounded-xl bg-mahjong-accent text-white font-bold
                active:scale-[0.98] transition-transform"
            >
              {t('game.keepRecord')}
            </button>
            <button
              onClick={() => { forceQuitGame(false); setShowForceQuit(false); }}
              className="w-full py-3 rounded-xl bg-mahjong-highlight text-white font-bold
                active:scale-[0.98] transition-transform"
            >
              {t('game.discard')}
            </button>
            <button
              onClick={() => setShowForceQuit(false)}
              className="w-full py-2 text-mahjong-muted text-sm"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
