import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores/game-store';
import { addPlayer } from '../lib/api';
import { WINDS, WIND_LABELS } from '@mahjong/shared';

export function LobbyPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const {
    room, game, playerId, connected,
    connect, toggleReady, swapSeats, startGame, setSession,
  } = useGameStore();

  const [copied, setCopied] = useState(false);
  const [selectedSwap, setSelectedSwap] = useState<string | null>(null);

  // Solo mode state
  const [soloMode, setSoloMode] = useState(false);
  const [soloNames, setSoloNames] = useState(['', '', '']);
  const [addingIdx, setAddingIdx] = useState<number | null>(null);
  const [soloError, setSoloError] = useState('');

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
    if (totalPlayers < 2) return;

    if (!selectedSwap) {
      setSelectedSwap(tappedPlayerId);
    } else if (selectedSwap === tappedPlayerId) {
      setSelectedSwap(null);
    } else {
      swapSeats(selectedSwap, tappedPlayerId);
      setSelectedSwap(null);
    }
  }

  async function handleAddPlayer(slotIdx: number) {
    const name = soloNames[slotIdx]?.trim();
    if (!name) { setSoloError('请输入名称'); return; }
    if (!roomCode) return;

    setAddingIdx(slotIdx);
    setSoloError('');
    try {
      await addPlayer(roomCode, name);
      // Server broadcasts player_joined → room state updates via WS
      setSoloNames(prev => {
        const next = [...prev];
        next[slotIdx] = '';
        return next;
      });
    } catch (e: any) {
      setSoloError(e.message);
    } finally {
      setAddingIdx(null);
    }
  }

  function handleSoloStart() {
    if (!room || room.players.length !== 4) return;
    const seatOrder = room.players.map(p => p.id);
    startGame(seatOrder);
  }

  const myPlayer = room?.players.find(p => p.id === playerId);
  const isReady = myPlayer?.ready ?? false;
  const readyCount = room?.players.filter(p => p.ready).length ?? 0;
  const totalPlayers = room?.players.length ?? 0;
  const anyReady = readyCount > 0;
  const emptySlots = 4 - totalPlayers;

  // Solo mode is only available when creator is the only player
  const canToggleSolo = totalPlayers === 1;

  // Disable solo toggle once other players have been added via solo mode
  // (but keep soloMode on so the UI stays consistent)

  // In solo mode, allow swapping anytime (no ready system)
  const canSwap = soloMode ? totalPlayers >= 2 : (totalPlayers >= 2 && !anyReady);

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
      {/* Room Code — hidden in solo mode */}
      {!soloMode && (
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
      )}

      {/* Solo mode header */}
      {soloMode && (
        <div className="text-center my-6">
          <h2 className="text-xl font-bold text-mahjong-gold">单人记录模式</h2>
          <p className="text-mahjong-muted text-sm">Solo Recording</p>
        </div>
      )}

      {/* Solo mode toggle — only when creator is alone */}
      {(canToggleSolo || soloMode) && (
        <div className="flex items-center justify-center gap-3 mb-4">
          <span className="text-sm text-mahjong-muted">单人记录 Solo</span>
          <button
            onClick={() => { setSoloMode(!soloMode); setSoloError(''); }}
            disabled={soloMode && totalPlayers > 1}
            className={`w-12 h-6 rounded-full relative transition-colors disabled:opacity-50
              ${soloMode ? 'bg-mahjong-green' : 'bg-mahjong-card border border-mahjong-accent'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform
              ${soloMode ? 'translate-x-6' : 'translate-x-0.5'}`}
            />
          </button>
        </div>
      )}

      {/* Players */}
      <div className="mb-6">
        <h2 className="text-sm text-mahjong-muted mb-3">
          玩家 Players ({totalPlayers}/4)
        </h2>
        {canSwap && (
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
                onClick={() => canSwap ? handlePlayerTap(player.id) : undefined}
                className={`flex items-center justify-between px-4 py-3 rounded-lg
                  transition-all
                  ${isSelected
                    ? 'bg-mahjong-gold/30 ring-2 ring-mahjong-gold'
                    : player.id === playerId
                      ? 'bg-mahjong-accent'
                      : 'bg-mahjong-card'}
                  ${canSwap ? 'cursor-pointer active:scale-[0.98]' : ''}`}
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
                  {!soloMode && (
                    player.ready ? (
                      <span className="text-xs font-bold text-mahjong-green px-2 py-0.5 rounded bg-mahjong-green/20">
                        Ready
                      </span>
                    ) : (
                      <span className="text-xs text-mahjong-muted px-2 py-0.5 rounded bg-mahjong-card">
                        ...
                      </span>
                    )
                  )}
                </div>
              </div>
            );
          })}

          {/* Empty slots */}
          {soloMode ? (
            // Solo mode: show name inputs for empty slots
            Array.from({ length: emptySlots }).map((_, i) => {
              const slotIdx = i;
              const windIdx = totalPlayers + i;
              return (
                <div
                  key={`solo-${i}`}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-mahjong-card"
                >
                  <span className="w-6 text-center text-sm font-bold text-mahjong-gold shrink-0">
                    {WIND_LABELS[WINDS[windIdx]]}
                  </span>
                  <input
                    type="text"
                    value={soloNames[slotIdx]}
                    onChange={e => setSoloNames(prev => {
                      const next = [...prev];
                      next[slotIdx] = e.target.value;
                      return next;
                    })}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddPlayer(slotIdx); }}
                    maxLength={12}
                    placeholder="输入名称..."
                    className="flex-1 min-w-0 px-2 py-1.5 rounded bg-mahjong-bg border border-mahjong-accent
                      text-white text-sm focus:outline-none focus:border-mahjong-highlight"
                  />
                  <button
                    onClick={() => handleAddPlayer(slotIdx)}
                    disabled={addingIdx === slotIdx || !soloNames[slotIdx]?.trim()}
                    className="px-3 py-1.5 rounded bg-mahjong-accent text-white text-sm font-medium
                      disabled:opacity-30 active:scale-95 transition-transform shrink-0"
                  >
                    {addingIdx === slotIdx ? '...' : '添加'}
                  </button>
                </div>
              );
            })
          ) : (
            // Normal mode: waiting placeholders
            Array.from({ length: emptySlots }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex items-center justify-center px-4 py-3 rounded-lg
                  bg-mahjong-card border border-dashed border-mahjong-accent text-mahjong-muted"
              >
                等待加入... Waiting...
              </div>
            ))
          )}
        </div>
      </div>

      {soloError && (
        <p className="text-mahjong-highlight text-sm text-center mb-4">{soloError}</p>
      )}

      {/* Ready status — normal mode only */}
      {!soloMode && totalPlayers === 4 && (
        <div className="text-center mb-4">
          <p className="text-sm text-mahjong-muted">
            {readyCount}/4 准备就绪 Ready
            {readyCount === 4 && ' - 对局即将开始!'}
          </p>
        </div>
      )}

      {/* Bottom action */}
      <div className="mt-auto pb-4">
        {soloMode ? (
          // Solo mode: Start Game button
          <>
            <button
              onClick={handleSoloStart}
              disabled={totalPlayers < 4}
              className="w-full py-4 rounded-xl bg-mahjong-green text-mahjong-bg font-bold text-lg
                transition-all active:scale-[0.98] disabled:opacity-30"
            >
              开始对局 Start Game
            </button>
            {totalPlayers < 4 && (
              <p className="text-center text-xs text-mahjong-muted mt-2">
                还需添加{emptySlots}位玩家 Add {emptySlots} more player{emptySlots > 1 ? 's' : ''}
              </p>
            )}
          </>
        ) : (
          // Normal mode: Ready button
          <>
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
                等待{emptySlots}位玩家加入 Waiting for {emptySlots} more player{emptySlots > 1 ? 's' : ''}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
