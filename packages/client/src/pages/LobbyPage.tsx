import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores/game-store';
import { addPlayer, listTags, createTag } from '../lib/api';
import { WINDS, WIND_LABELS, M_LEAGUE_RULES, defaultScoreFormula } from '@mahjong/shared';
import { RulesIsland } from '../components/game/RulesIsland';

export function LobbyPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const {
    room, game, playerId, connected, customRuleset, gameTags,
    connect, toggleReady, swapSeats, startGame, setSession, setRuleset, toggleTag,
  } = useGameStore();

  const [copied, setCopied] = useState(false);
  const [selectedSwap, setSelectedSwap] = useState<string | null>(null);

  // Solo mode state
  const [soloMode, setSoloMode] = useState(false);
  const [soloNames, setSoloNames] = useState(['', '', '']);
  const [soloPhones, setSoloPhones] = useState(['', '', '']);
  const [addingIdx, setAddingIdx] = useState<number | null>(null);
  const [soloError, setSoloError] = useState('');

  // Tags from API
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);

  useEffect(() => {
    listTags().then(res => setAvailableTags(res.tags)).catch(() => {});
  }, []);

  async function handleCreateTag() {
    const name = newTagInput.trim();
    if (!name) return;
    setCreatingTag(true);
    try {
      const res = await createTag(name);
      setAvailableTags(prev => prev.includes(res.tag) ? prev : [...prev, res.tag]);
      if (!gameTags.includes(res.tag)) {
        toggleTag(res.tag);
      }
      setNewTagInput('');
    } catch { /* ignore */ } finally {
      setCreatingTag(false);
    }
  }

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
      const phone = soloPhones[slotIdx]?.trim() || undefined;
      await addPlayer(roomCode, name, phone);
      // Server broadcasts player_joined → room state updates via WS
      setSoloNames(prev => {
        const next = [...prev];
        next[slotIdx] = '';
        return next;
      });
      setSoloPhones(prev => {
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

  // Derived ruleset values
  const ruleStarting = (customRuleset.startingPoints ?? M_LEAGUE_RULES.startingPoints);
  const ruleUma = (customRuleset.uma ?? M_LEAGUE_RULES.uma);
  const ruleTobi = (customRuleset.tobiEnabled ?? M_LEAGUE_RULES.tobiEnabled);
  const ruleOka = (customRuleset.okaEnabled ?? M_LEAGUE_RULES.okaEnabled);
  const ruleFormula = (customRuleset.scoreFormula ?? M_LEAGUE_RULES.scoreFormula);

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
            className={`w-11 h-6 rounded-full p-0.5 transition-colors disabled:opacity-50 flex items-center
              ${soloMode ? 'bg-mahjong-green' : 'bg-mahjong-card border border-mahjong-accent'}`}
          >
            <span className={`w-5 h-5 rounded-full bg-white block transition-transform
              ${soloMode ? 'translate-x-5' : 'translate-x-0'}`}
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
                  <div>
                    <span className="font-medium">{player.name}</span>
                    {player.phone && (
                      <span className="text-xs text-mahjong-muted ml-2">{player.phone}</span>
                    )}
                  </div>
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
            // Solo mode: show name + phone inputs for empty slots
            Array.from({ length: emptySlots }).map((_, i) => {
              const slotIdx = i;
              const windIdx = totalPlayers + i;
              return (
                <div
                  key={`solo-${i}`}
                  className="px-4 py-2 rounded-lg bg-mahjong-card space-y-1.5"
                >
                  <div className="flex items-center gap-2">
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
                  <div className="flex items-center gap-2 pl-8">
                    <input
                      type="tel"
                      value={soloPhones[slotIdx]}
                      onChange={e => setSoloPhones(prev => {
                        const next = [...prev];
                        next[slotIdx] = e.target.value;
                        return next;
                      })}
                      maxLength={20}
                      placeholder="手机号 (可选)..."
                      className="flex-1 min-w-0 px-2 py-1 rounded bg-mahjong-bg border border-mahjong-accent/50
                        text-white text-xs focus:outline-none focus:border-mahjong-highlight"
                    />
                  </div>
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

      {/* Rules Island */}
      <RulesIsland
        startingPoints={ruleStarting}
        uma={ruleUma}
        tobiEnabled={ruleTobi}
        okaEnabled={ruleOka}
        scoreFormula={ruleFormula}
        editable={true}
        onChange={(updates) => setRuleset(updates as Partial<typeof M_LEAGUE_RULES>)}
      />

      {/* Game Tags */}
      <div className="mt-3 px-4 py-2 rounded-xl bg-mahjong-card">
        <p className="text-xs text-mahjong-muted mb-2">标签 Tags</p>
        <div className="flex flex-wrap gap-2">
          {availableTags.map((tag: string) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${gameTags.includes(tag)
                  ? 'bg-mahjong-gold text-mahjong-bg font-bold'
                  : 'bg-mahjong-bg text-mahjong-muted border border-mahjong-accent'}`}
            >
              {tag}
            </button>
          ))}
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newTagInput}
              onChange={e => setNewTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateTag(); }}
              placeholder="新标签..."
              maxLength={20}
              className="w-24 px-2 py-1.5 rounded-lg bg-mahjong-bg border border-mahjong-accent
                text-white text-sm focus:outline-none focus:border-mahjong-highlight"
            />
            <button
              onClick={handleCreateTag}
              disabled={creatingTag || !newTagInput.trim()}
              className="px-2 py-1.5 rounded-lg bg-mahjong-accent text-white text-sm font-medium
                disabled:opacity-30 active:scale-95 transition-transform"
            >
              +
            </button>
          </div>
        </div>
      </div>

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
