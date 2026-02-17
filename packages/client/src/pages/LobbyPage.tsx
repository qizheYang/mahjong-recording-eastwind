import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores/game-store';
import { WINDS, WIND_LABELS } from '@mahjong/shared';
import type { Wind } from '@mahjong/shared';

export function LobbyPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const {
    room, game, playerId, connected,
    connect, startGame, setSession,
  } = useGameStore();

  // Seat assignment: array of player IDs in seat order [East, South, West, North]
  const [seatOrder, setSeatOrder] = useState<(string | null)[]>([null, null, null, null]);
  const [copied, setCopied] = useState(false);

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

  // Auto-assign seats when 4 players are in
  useEffect(() => {
    if (room && room.players.length === 4 && seatOrder.every(s => s === null)) {
      setSeatOrder(room.players.map(p => p.id));
    }
  }, [room?.players.length]);

  function handleCopyCode() {
    navigator.clipboard.writeText(roomCode || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSeatChange(seatIdx: number, playerId: string) {
    setSeatOrder(prev => {
      const next = [...prev];
      // Remove player from any other seat
      const existingIdx = next.indexOf(playerId);
      if (existingIdx >= 0) next[existingIdx] = null;
      // Also move displaced player to the vacated seat
      if (next[seatIdx] && existingIdx >= 0) {
        next[existingIdx] = next[seatIdx];
      }
      next[seatIdx] = playerId;
      return next;
    });
  }

  function handleStart() {
    const filledSeats = seatOrder.filter(Boolean);
    if (filledSeats.length !== 4) return;
    startGame(filledSeats as string[]);
  }

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
          玩家 Players ({room?.players.length || 0}/4)
        </h2>
        <div className="space-y-2">
          {room?.players.map((player) => (
            <div
              key={player.id}
              className={`flex items-center justify-between px-4 py-3 rounded-lg
                ${player.id === playerId ? 'bg-mahjong-accent' : 'bg-mahjong-card'}`}
            >
              <span className="font-medium">{player.name}</span>
              {player.id === playerId && (
                <span className="text-xs text-mahjong-green">你 You</span>
              )}
            </div>
          ))}
          {Array.from({ length: 4 - (room?.players.length || 0) }).map((_, i) => (
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

      {/* Seat Assignment */}
      {room && room.players.length === 4 && (
        <div className="mb-6">
          <h2 className="text-sm text-mahjong-muted mb-3">座位分配 Seat Assignment</h2>
          <div className="space-y-2">
            {WINDS.map((wind, idx) => (
              <div key={wind} className="flex items-center gap-3">
                <span className="w-8 text-center text-lg font-bold text-mahjong-gold">
                  {WIND_LABELS[wind]}
                </span>
                <select
                  value={seatOrder[idx] || ''}
                  onChange={e => handleSeatChange(idx, e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-mahjong-card border border-mahjong-accent
                    text-white focus:outline-none focus:border-mahjong-highlight"
                >
                  <option value="">-- 选择玩家 --</option>
                  {room.players.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {idx === 0 && (
                  <span className="text-xs text-mahjong-highlight">庄 Dealer</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Start Button */}
      <div className="mt-auto pb-4">
        <button
          onClick={handleStart}
          disabled={room?.players.length !== 4 || seatOrder.filter(Boolean).length !== 4}
          className="w-full py-4 rounded-xl bg-mahjong-green text-mahjong-bg font-bold text-lg
            disabled:opacity-30 active:scale-[0.98] transition-transform"
        >
          开始对局 Start Game
        </button>
      </div>
    </div>
  );
}
