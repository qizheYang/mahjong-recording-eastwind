import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores/game-store';
import { ScoreBoard } from '../components/game/ScoreBoard';
import { HandHistory } from '../components/game/HandHistory';
import { RecordHandModal } from '../components/game/RecordHandModal';
import { PenaltyModal } from '../components/game/PenaltyModal';
import { formatRound } from '../lib/format';
import { isAllLastHand, M_LEAGUE_RULES } from '@mahjong/shared';
import type { HandResultInput, PenaltyInput } from '@mahjong/shared';
import { RulesIsland } from '../components/game/RulesIsland';
import { useLocale } from '../i18n';

export function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { t } = useLocale();
  const {
    room, game, finalScores, playerId, connected, roomCode: storeRoomCode,
    connect, setSession,
    toggleRiichi, recordHand, editHand, undoLastHand, recordPenalty, undoPenalty,
    endGame, forceQuitGame, error, errorCode, clearError,
  } = useGameStore();

  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [showForceQuit, setShowForceQuit] = useState(false);
  const [showPenaltyModal, setShowPenaltyModal] = useState(false);
  const [editingHandNumber, setEditingHandNumber] = useState<number | null>(null);

  // Restore session
  useEffect(() => {
    const storedRoom = localStorage.getItem('roomCode');
    const storedPlayer = localStorage.getItem('playerId');
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

  // Redirect home if session was invalidated (e.g. INVALID_ROOM error)
  useEffect(() => {
    if (!storeRoomCode && !playerId) {
      navigate('/', { replace: true });
    }
  }, [storeRoomCode, playerId, navigate]);

  function showSendError() {
    set_sendError(true);
    setTimeout(() => set_sendError(false), 3000);
  }

  const [sendError, set_sendError] = useState(false);

  function handleRecordHand(result: HandResultInput) {
    let sent: boolean;
    if (editingHandNumber !== null) {
      sent = editHand(editingHandNumber, result);
      setEditingHandNumber(null);
    } else {
      sent = recordHand(result);
    }
    if (sent) {
      setShowRecordModal(false);
    } else {
      showSendError();
    }
  }

  function handleUndo() {
    if (confirmUndo) {
      const sent = undoLastHand();
      setConfirmUndo(false);
      if (!sent) showSendError();
    } else {
      setConfirmUndo(true);
      setTimeout(() => setConfirmUndo(false), 3000);
    }
  }

  if (!game) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-mahjong-muted">{t('common.connecting')}</p>
      </div>
    );
  }

  const isAllLast = isAllLastHand(game);

  return (
    <div className="min-h-dvh flex flex-col p-4 max-w-md mx-auto">
      {/* Reconnecting banner */}
      {!connected && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-600 text-white text-center
          py-2 text-sm font-medium animate-pulse">
          {t('common.reconnecting')}
        </div>
      )}

      {/* Send failure toast */}
      {sendError && (
        <div className="fixed top-10 left-4 right-4 z-50 bg-mahjong-highlight text-white
          rounded-lg p-3 text-sm text-center"
          onClick={() => set_sendError(false)}
        >
          {t('common.sendFailed')}
        </div>
      )}

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
        liveRiichi={game.liveRiichi}
        onToggleRiichi={toggleRiichi}
      />

      {/* Rules info bar */}
      <div className="mt-4">
        <RulesIsland
          startingPoints={game.ruleset?.startingPoints ?? M_LEAGUE_RULES.startingPoints}
          uma={game.ruleset?.uma ?? M_LEAGUE_RULES.uma}
          tobiEnabled={game.ruleset?.tobiEnabled ?? M_LEAGUE_RULES.tobiEnabled}
          okaEnabled={game.ruleset?.okaEnabled ?? M_LEAGUE_RULES.okaEnabled}
          kiriageMangan={game.ruleset?.kiriageMangan ?? M_LEAGUE_RULES.kiriageMangan}
          doubleRonEnabled={game.ruleset?.doubleRonEnabled ?? M_LEAGUE_RULES.doubleRonEnabled}
          nagashiManganEnabled={game.ruleset?.nagashiManganEnabled ?? M_LEAGUE_RULES.nagashiManganEnabled}
          countedYakumanEnabled={game.ruleset?.countedYakumanEnabled ?? M_LEAGUE_RULES.countedYakumanEnabled}
          doubleYakumanEnabled={game.ruleset?.doubleYakumanEnabled ?? M_LEAGUE_RULES.doubleYakumanEnabled}
          multipleYakumanEnabled={game.ruleset?.multipleYakumanEnabled ?? M_LEAGUE_RULES.multipleYakumanEnabled}
          scoreFormula={game.ruleset?.scoreFormula ?? M_LEAGUE_RULES.scoreFormula}
          teamMode={game.ruleset?.teamMode}
          manganMinimum={game.ruleset?.manganMinimum}
          onlySubtract={game.ruleset?.onlySubtract}
          teammateNoTsumoPayment={game.ruleset?.teammateNoTsumoPayment}
          noRiichiDeposit={game.ruleset?.noRiichiDeposit}
          scma2v2DrawPenalty={game.ruleset?.scma2v2DrawPenalty}
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
          <button
            onClick={() => setShowPenaltyModal(true)}
            className="flex-1 py-2 rounded-lg bg-mahjong-card text-mahjong-highlight text-sm
              active:scale-[0.98] transition-transform"
          >
            {t('game.recordPenalty')}
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
          <HandHistory
            hands={game.hands}
            players={game.players}
            onEditHand={(handNumber) => {
              setEditingHandNumber(handNumber);
              setShowRecordModal(true);
            }}
          />
        </div>
      )}

      {/* Record hand modal */}
      {showRecordModal && (
        <RecordHandModal
          players={game.players}
          currentDealer={editingHandNumber !== null
            ? (game.hands.find(h => h.handNumber === editingHandNumber)?.dealerIndex ?? game.currentDealer)
            : game.currentDealer}
          honbaCount={editingHandNumber !== null
            ? (game.hands.find(h => h.handNumber === editingHandNumber)?.honba ?? game.honbaCount)
            : game.honbaCount}
          riichiSticks={editingHandNumber !== null
            ? (game.hands.find(h => h.handNumber === editingHandNumber)?.riichiSticksOnTable ?? game.riichiSticks)
            : game.riichiSticks}
          kiriageMangan={game.ruleset?.kiriageMangan}
          doubleRonEnabled={game.ruleset?.doubleRonEnabled}
          doubleYakumanEnabled={game.ruleset?.doubleYakumanEnabled}
          multipleYakumanEnabled={game.ruleset?.multipleYakumanEnabled}
          countedYakumanEnabled={game.ruleset?.countedYakumanEnabled}
          nagashiManganEnabled={game.ruleset?.nagashiManganEnabled}
          liveRiichi={game.liveRiichi}
          editingHand={editingHandNumber !== null
            ? game.hands.find(h => h.handNumber === editingHandNumber)
            : undefined}
          onSubmit={handleRecordHand}
          onClose={() => { setShowRecordModal(false); setEditingHandNumber(null); }}
        />
      )}

      {/* Penalty modal */}
      {showPenaltyModal && (
        <PenaltyModal
          players={game.players}
          onSubmit={(penalty) => {
            const sent = recordPenalty(penalty);
            if (sent) {
              setShowPenaltyModal(false);
            } else {
              showSendError();
            }
          }}
          onClose={() => setShowPenaltyModal(false)}
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
              onClick={() => {
                const sent = forceQuitGame();
                if (sent) {
                  setShowForceQuit(false);
                } else {
                  showSendError();
                }
              }}
              className="w-full py-3 rounded-xl bg-mahjong-accent text-white font-bold
                active:scale-[0.98] transition-transform"
            >
              {t('game.endAndSave')}
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
