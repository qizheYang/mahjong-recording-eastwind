import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useGameStore } from '../stores/game-store';
import { useAdminStore } from '../stores/admin-store';
import { getGameAnnotations, updateGameAnnotations, searchRegisteredUsers, deleteGame } from '../lib/api';
import { formatPoints, formatGameScore } from '../lib/format';
import { useLocale } from '../i18n';

const PLACEMENT_COLORS = ['text-mahjong-gold', 'text-white', 'text-mahjong-muted', 'text-mahjong-highlight'];

export function ResultsPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { t } = useLocale();
  const {
    game, finalScores, teamScores, savedFilename, playerId, connected,
    connect, setSession, resetForNewGame, leaveRoom,
  } = useGameStore();
  const { token: adminToken } = useAdminStore();
  const [isOfficial, setIsOfficial] = useState(false);
  const [notes, setNotes] = useState('');
  const [annotationSaving, setAnnotationSaving] = useState(false);
  const [annotationSaved, setAnnotationSaved] = useState(false);

  // Restore session
  useEffect(() => {
    const storedRoom = localStorage.getItem('roomCode');
    const storedPlayer = localStorage.getItem('playerId');
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

  // Load existing annotations if admin
  useEffect(() => {
    if (!adminToken || !savedFilename) return;
    getGameAnnotations(adminToken, savedFilename).then(res => {
      if (res.annotations) {
        setIsOfficial(res.annotations.isOfficialGame);
        setNotes(res.annotations.notes);
      }
    }).catch(() => {});
  }, [adminToken, savedFilename]);

  // Check if current player is registered
  const [isPlayerRegistered, setIsPlayerRegistered] = useState<boolean | null>(null);
  const myName = game?.players.find(p => p.id === playerId)?.name;

  useEffect(() => {
    if (!myName) return;
    searchRegisteredUsers(myName).then(res => {
      setIsPlayerRegistered(res.users.some(u => u.username.toLowerCase() === myName.toLowerCase()));
    }).catch(() => {});
  }, [myName]);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function handleNewGame() {
    resetForNewGame();
    navigate(`/lobby/${roomCode}`);
  }

  async function handleDeleteRecord() {
    if (!savedFilename) return;
    setDeleting(true);
    try {
      await deleteGame(savedFilename);
      leaveRoom();
      navigate('/');
    } catch {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  async function handleSaveAnnotations() {
    if (!adminToken || !savedFilename) return;
    setAnnotationSaving(true);
    try {
      await updateGameAnnotations(adminToken, savedFilename, { isOfficialGame: isOfficial, notes });
      setAnnotationSaved(true);
      setTimeout(() => setAnnotationSaved(false), 2000);
    } catch {
      // ignore
    } finally {
      setAnnotationSaving(false);
    }
  }

  function handleShare() {
    if (!finalScores || !game) return;
    const lines = [
      t('results.shareTitle'),
      t('results.handsPlayed', { count: game.hands.length }),
      '',
    ];
    // Add team results if present
    if (teamScores && teamScores.length > 0) {
      lines.push(`[${t('results.teamResults')}]`);
      for (const ts of teamScores) {
        lines.push(`${ts.placement}. ${ts.teamName}: ${ts.totalGameScore > 0 ? '+' : ''}${ts.totalGameScore.toFixed(1)}`);
      }
      lines.push('');
    }
    lines.push(
      ...finalScores.map((s) => {
        const rank = t(`results.placement.${s.placement}`);
        return `${rank} ${s.name}: ${formatPoints(s.rawPoints)}${t('mahjong.points')} (${formatGameScore(s.gameScore)})`;
      }),
    );
    navigator.clipboard.writeText(lines.join('\n'));
  }

  if (!finalScores) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="text-center">
          <p className="text-mahjong-muted mb-4">{t('results.noResults')}</p>
          <button
            onClick={() => navigate(`/game/${roomCode}`)}
            className="px-6 py-2 rounded-lg bg-mahjong-accent text-white"
          >
            {t('results.backToGame')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col p-4 max-w-md mx-auto">
      <div className="text-center my-6">
        <h1 className="text-3xl font-bold mb-1">{t('results.title')}</h1>
        {game && (
          <p className="text-mahjong-muted text-xs mt-1">{t('results.handsPlayed', { count: game.hands.length })}</p>
        )}
      </div>

      {/* Team results */}
      {teamScores && teamScores.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm text-mahjong-muted mb-2">{t('results.teamResults')}</h2>
          <div className="space-y-2">
            {teamScores.map((ts, i) => (
              <div
                key={ts.teamName}
                className={`rounded-xl p-4 flex items-center justify-between ${
                  i === 0 ? 'bg-mahjong-accent ring-2 ring-mahjong-gold' : 'bg-mahjong-card'
                }`}
              >
                <div>
                  <span className={`text-2xl font-bold ${i === 0 ? 'text-mahjong-gold' : 'text-white'}`}>
                    {ts.placement}
                  </span>
                  <span className="text-lg font-medium ml-2">{ts.teamName}</span>
                </div>
                <p className={`text-2xl font-bold font-mono ${
                  ts.totalGameScore >= 0 ? 'text-mahjong-green' : 'text-mahjong-highlight'
                }`}>
                  {ts.totalGameScore > 0 ? '+' : ''}{ts.totalGameScore.toFixed(1)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

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
                  {t(`results.placement.${score.placement}`)}
                </span>
              </div>
              <div className="text-right">
                <p className={`text-2xl font-bold font-mono ${
                  score.gameScore >= 0 ? 'text-mahjong-green' : 'text-mahjong-highlight'
                }`}>
                  {formatGameScore(score.gameScore)}
                </p>
                <p className="text-xs text-mahjong-muted">{t('results.gameScore')}</p>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="font-medium text-lg">{score.name}</p>
                {game?.players[score.playerIndex]?.team && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-mahjong-green/20 text-mahjong-green font-medium">
                    {game.players[score.playerIndex].team}
                  </span>
                )}
              </div>
              <div className="text-right text-sm">
                <span className="text-mahjong-muted">{formatPoints(score.rawPoints)}{t('mahjong.points')}</span>
                <span className="text-mahjong-muted ml-2">uma {score.uma > 0 ? '+' : ''}{score.uma}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Admin annotation panel */}
      {adminToken && savedFilename && (
        <div className="bg-mahjong-card rounded-xl p-4 mb-6 space-y-3">
          <p className="text-xs text-mahjong-muted font-medium">{t('results.adminAnnotations')}</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isOfficial}
              onChange={e => { setIsOfficial(e.target.checked); setAnnotationSaved(false); }}
              className="w-4 h-4 accent-mahjong-gold"
            />
            <span className="text-sm">{t('results.officialGame')}</span>
          </label>
          <textarea
            value={notes}
            onChange={e => { setNotes(e.target.value); setAnnotationSaved(false); }}
            placeholder={t('results.notes')}
            rows={2}
            className="w-full px-3 py-2 rounded-lg bg-mahjong-bg border border-mahjong-accent
              text-white text-sm focus:outline-none focus:border-mahjong-highlight resize-none"
          />
          <button
            onClick={handleSaveAnnotations}
            disabled={annotationSaving}
            className={`w-full py-2 rounded-lg font-bold text-sm transition-colors
              ${annotationSaved
                ? 'bg-mahjong-green text-mahjong-bg'
                : 'bg-mahjong-accent text-white'} disabled:opacity-50`}
          >
            {annotationSaving ? t('common.saving') : annotationSaved ? t('common.saved') : t('results.saveAnnotations')}
          </button>
        </div>
      )}

      {/* Registration CTA for unregistered players */}
      {isPlayerRegistered === false && (
        <Link
          to="/register"
          className="block bg-mahjong-card rounded-xl p-4 mb-6 text-center hover:ring-1 hover:ring-mahjong-gold/30 transition-all"
        >
          <p className="text-sm font-medium text-mahjong-gold mb-1">{t('results.registerCTA')}</p>
          <p className="text-xs text-mahjong-muted">{t('results.registerHint')}</p>
        </Link>
      )}

      {/* Actions */}
      <div className="mt-auto space-y-3 pb-4">
        <button
          onClick={handleShare}
          className="w-full py-3 rounded-xl bg-mahjong-accent text-white font-bold
            active:scale-[0.98] transition-transform"
        >
          {t('results.copyResults')}
        </button>
        <button
          onClick={handleNewGame}
          className="w-full py-3 rounded-xl bg-mahjong-green text-mahjong-bg font-bold
            active:scale-[0.98] transition-transform"
        >
          {t('results.newGame')}
        </button>
        <button
          onClick={() => { leaveRoom(); navigate('/'); }}
          className="w-full py-2 text-mahjong-muted text-sm"
        >
          {t('common.backToHome')}
        </button>
        {savedFilename && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full py-2 text-mahjong-highlight/60 text-xs
              active:scale-[0.98] transition-transform"
          >
            {t('results.deleteRecord')}
          </button>
        )}
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative w-full max-w-xs bg-mahjong-bg rounded-2xl p-5 space-y-4">
            <h3 className="text-lg font-bold text-center text-mahjong-highlight">
              {t('results.deleteRecord')}
            </h3>
            <p className="text-sm text-mahjong-muted text-center">
              {t('results.deleteRecordConfirm')}
            </p>
            <button
              onClick={handleDeleteRecord}
              disabled={deleting}
              className="w-full py-3 rounded-xl bg-mahjong-highlight text-white font-bold
                active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {deleting ? t('common.deleting') : t('results.deleteRecord')}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
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
