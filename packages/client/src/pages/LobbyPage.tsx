import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores/game-store';
import { WINDS, WIND_LABELS } from '@mahjong/shared';

export function LobbyPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const {
    room, game, playerId, connected,
    connect, toggleReady, swapSeats, setSession,
  } = useGameStore();

  const [copied, setCopied] = useState(false);
  const [selectedSwap, setSelectedSwap] = useState<string | null>(null);

  // Restore session from storage if needed
  useEffect(() => {
    const storedRoom = sessionStorage.getItem('roomCode');
    const storedPlayer = sessionStorage.getItem('playerId');
    if (storedRoom === roomCode && storedPlayer && !playerId) {
      setSession(storedRoom, storedPlayer);
    }
  }, [roomCode, playerId, setSession]);

  // Connect WebSocket (no disconnect on unmount — connection persists across pages)
  useEffect(() => {
    if (roomCode && playerId) {
      connect();
    }
  }, [roomCode, playerId, connect]);

  // Redirect to game page when game starts
  useEffect(() => {
    if (game && game.status === 'in_progress') {
      navigate(`/game/${roomCode}`);
    }
  }, [game, roomCode, navigate]);

  function handleCopyCode() {
    navigator.clipboard.writeText(roomCode || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handlePlayerTap(tappedPlayerId: string) {
    if (totalPlayers < 2) return; // Need at least 2 players to swap

    if (!selectedSwap) {
      // First tap: select this player
      setSelectedSwap(tappedPlayerId);
    } else if (selectedSwap === tappedPlayerId) {
      // Tap same player: deselect
      setSelectedSwap(null);
    } else {
      // Second tap: swap with selected player
      swapSeats(selectedSwap, tappedPlayerId);
      setSelectedSwap(null);
    }
  }

  const myPlayer = room?.players.find(p => p.id === playerId);
  const isReady = myPlayer?.ready ?? false;
  const readyCount = room?.players.filter(p => p.ready).length ?? 0;
  const totalPlayers = room?.players.length ?? 0;
  const anyReady = readyCount > 0;

  if (!connected && playerId) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-mahjong-muted">连接中... Connecting...</p>
      </div>
    );
  }

  if (!playerId) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-mahjong-muted mb-4">未加入此房间</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 rounded-lg bg-mahjong-accent text-white"
          >
            返回首页 Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col p-4 max-w-sm mx-auto">
      {/* Room Code */}
      <div className="text-center my-6">
        <p className="text-mahjong-muted text-sm mb-1">房间号 Room Code</p>
        <button
          onClick={handleCopyCode}
          className="text-5xl font-mono font-bold tracking-[0.3em] text-mahjong-gold
            active:scale-95 transition-transform"
        >
          {roomCode}
        </button>
        <p className="text-mahjong-muted text-xs mt-1">
          {copied ? '已复制! Copied!' : '点击复制 Tap to copy'}
        </p>
      </div>

      {/* Players */}
      <div className="mb-6">
        <h2 className="text-sm text-mahjong-muted mb-3">
          玩家 Players ({totalPlayers}/4)
        </h2>
        {totalPlayers >= 2 && !anyReady && (
          <p className="text-xs text-mahjong-gold mb-2">
            点击两位玩家交换座位 Tap two players to swap seats
          </p>
        )}
        <div className="space-y-2">
          {room?.players.map((player, idx) => {
            const isSelected = selectedSwap === player.id;
            return (
              <div
                key={player.id}
                onClick={() => !anyReady ? handlePlayerTap(player.id) : undefined}
                className={`flex items-center justify-between px-4 py-3 rounded-lg
                  transition-all
                  ${isSelected
                    ? 'bg-mahjong-gold/30 ring-2 ring-mahjong-gold'
                    : player.id === playerId
                      ? 'bg-mahjong-accent'
                      : 'bg-mahjong-card'}
                  ${!anyReady && totalPlayers >= 2 ? 'cursor-pointer active:scale-[0.98]' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-center text-sm font-bold text-mahjong-gold">
                    {WIND_LABELS[WINDS[idx]]}
                  </span>
                  <span className="font-medium">{player.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {player.id === playerId && (
                    <span className="text-xs text-mahjong-muted">你 You</span>
                  )}
                  {player.ready ? (
                    <span className="text-xs font-bold text-mahjong-green px-2 py-0.5 rounded bg-mahjong-green/20">
                      Ready
                    </span>
                  ) : (
                    <span className="text-xs text-mahjong-muted px-2 py-0.5 rounded bg-mahjong-card">
                      ...
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {Array.from({ length: 4 - totalPlayers }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="flex items-center justify-center px-4 py-3 rounded-lg
                bg-mahjong-card border border-dashed border-mahjong-accent text-mahjong-muted"
            >
              等待加入... Waiting...
            </div>
          ))}
        </div>
      </div>

      {/* Ready status */}
      {totalPlayers === 4 && (
        <div className="text-center mb-4">
          <p className="text-sm text-mahjong-muted">
            {readyCount}/4 准备就绪 Ready
            {readyCount === 4 && ' - 对局即将开始!'}
          </p>
        </div>
      )}

      {/* Ready Button */}
      <div className="mt-auto pb-4">
        <button
          onClick={toggleReady}
          disabled={totalPlayers < 4}
          className={`w-full py-4 rounded-xl font-bold text-lg
            transition-all active:scale-[0.98]
            ${isReady
              ? 'bg-mahjong-card text-mahjong-muted border-2 border-mahjong-green'
              : 'bg-mahjong-green text-mahjong-bg'}
            disabled:opacity-30`}
        >
          {isReady ? '取消准备 Cancel Ready' : '准备 Ready'}
        </button>
        {totalPlayers < 4 && (
          <p className="text-center text-xs text-mahjong-muted mt-2">
            等待{4 - totalPlayers}位玩家加入 Waiting for {4 - totalPlayers} more player{4 - totalPlayers > 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  );
}
