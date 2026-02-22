import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores/game-store';
import { addPlayer, listTags, createTag, searchRegisteredUsers, type RegisteredUser } from '../lib/api';
import { WINDS, M_LEAGUE_RULES, defaultScoreFormula } from '@mahjong/shared';
import type { PresetName } from '@mahjong/shared';
import { RulesIsland } from '../components/game/RulesIsland';
import { useLocale } from '../i18n';

export function LobbyPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { t } = useLocale();
  const {
    room, game, playerId, connected, customRuleset, gameTags,
    connect, toggleReady, swapSeats, startGame, setSession, setRuleset, toggleTag,
  } = useGameStore();

  const [copied, setCopied] = useState(false);
  const [selectedSwap, setSelectedSwap] = useState<string | null>(null);

  // Solo mode state
  const [soloMode, setSoloMode] = useState(false);
  const [soloNames, setSoloNames] = useState(['', '', '']);
  const [addingIdx, setAddingIdx] = useState<number | null>(null);
  const [soloError, setSoloError] = useState('');

  // Autocomplete state for solo mode
  const [suggestions, setSuggestions] = useState<RegisteredUser[]>([]);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);

  useEffect(() => {
    if (activeSlot === null) { setSuggestions([]); return; }
    const query = soloNames[activeSlot]?.trim();
    if (!query || query.length < 1) { setSuggestions([]); return; }

    const timer = setTimeout(async () => {
      try {
        const res = await searchRegisteredUsers(query);
        setSuggestions(res.users);
      } catch { setSuggestions([]); }
    }, 200);
    return () => clearTimeout(timer);
  }, [activeSlot, soloNames]);

  // Preset tracking
  const [presetName, setPresetName] = useState<PresetName>('mleague');

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
    if (!name) { setSoloError(t('validation.enterName')); return; }
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

  // Derived ruleset values
  const ruleStarting = (customRuleset.startingPoints ?? M_LEAGUE_RULES.startingPoints);
  const ruleUma = (customRuleset.uma ?? M_LEAGUE_RULES.uma);
  const ruleTobi = (customRuleset.tobiEnabled ?? M_LEAGUE_RULES.tobiEnabled);
  const ruleOka = (customRuleset.okaEnabled ?? M_LEAGUE_RULES.okaEnabled);
  const ruleKiriage = (customRuleset.kiriageMangan ?? M_LEAGUE_RULES.kiriageMangan);
  const ruleDoubleRon = (customRuleset.doubleRonEnabled ?? M_LEAGUE_RULES.doubleRonEnabled);
  const ruleNagashi = (customRuleset.nagashiManganEnabled ?? M_LEAGUE_RULES.nagashiManganEnabled);
  const ruleCountedYakuman = (customRuleset.countedYakumanEnabled ?? M_LEAGUE_RULES.countedYakumanEnabled);
  const ruleDoubleYakuman = (customRuleset.doubleYakumanEnabled ?? M_LEAGUE_RULES.doubleYakumanEnabled);
  const ruleFormula = (customRuleset.scoreFormula ?? M_LEAGUE_RULES.scoreFormula);

  if (!connected && playerId) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-mahjong-muted">{t('common.connecting')}</p>
      </div>
    );
  }

  if (!playerId) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-mahjong-muted mb-4">{t('lobby.notJoined')}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 rounded-lg bg-mahjong-accent text-white"
          >
            {t('common.backToHome')}
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
          <p className="text-mahjong-muted text-sm mb-1">{t('lobby.roomCode')}</p>
          <button
            onClick={handleCopyCode}
            className="text-5xl font-mono font-bold tracking-[0.3em] text-mahjong-gold
              active:scale-95 transition-transform"
          >
            {roomCode}
          </button>
          <p className="text-mahjong-muted text-xs mt-1">
            {copied ? t('lobby.copied') : t('lobby.tapToCopy')}
          </p>
        </div>
      )}

      {/* Solo mode header */}
      {soloMode && (
        <div className="text-center my-6">
          <h2 className="text-xl font-bold text-mahjong-gold">{t('lobby.soloMode')}</h2>
          <p className="text-mahjong-muted text-sm">{t('lobby.soloRecording')}</p>
        </div>
      )}

      {/* Solo mode toggle — only when creator is alone */}
      {(canToggleSolo || soloMode) && (
        <div className="flex items-center justify-center gap-3 mb-4">
          <span className="text-sm text-mahjong-muted">{t('lobby.solo')}</span>
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
          {t('lobby.playersCount', { n: totalPlayers })}
        </h2>
        {canSwap && (
          <p className="text-xs text-mahjong-gold mb-2">
            {t('lobby.swapHint')}
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
                    {t(`mahjong.wind.${WINDS[idx]}`)}
                  </span>
                  <div>
                    <span className="font-medium">{player.name}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {player.id === playerId && (
                    <span className="text-xs text-mahjong-muted">{t('lobby.you')}</span>
                  )}
                  {!soloMode && (
                    player.ready ? (
                      <span className="text-xs font-bold text-mahjong-green px-2 py-0.5 rounded bg-mahjong-green/20">
                        {t('lobby.ready')}
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
            // Solo mode: show name + phone inputs with autocomplete for empty slots
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
                      {t(`mahjong.wind.${WINDS[windIdx]}`)}
                    </span>
                    <div className="relative flex-1 min-w-0">
                      <input
                        type="text"
                        value={soloNames[slotIdx]}
                        onChange={e => {
                          setSoloNames(prev => {
                            const next = [...prev];
                            next[slotIdx] = e.target.value;
                            return next;
                          });
                          setActiveSlot(slotIdx);
                        }}
                        onFocus={() => setActiveSlot(slotIdx)}
                        onBlur={() => setTimeout(() => setActiveSlot(null), 150)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddPlayer(slotIdx); }}
                        maxLength={12}
                        placeholder={t('user.searchUser')}
                        className="w-full px-2 py-1.5 rounded bg-mahjong-bg border border-mahjong-accent
                          text-white text-sm focus:outline-none focus:border-mahjong-highlight"
                      />
                      {/* Autocomplete dropdown */}
                      {activeSlot === slotIdx && suggestions.length > 0 && (
                        <div className="absolute z-10 left-0 right-0 top-full mt-0.5 bg-mahjong-bg border border-mahjong-accent
                          rounded shadow-lg max-h-32 overflow-y-auto">
                          {suggestions.map(u => (
                            <button
                              key={u.id}
                              type="button"
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => {
                                setSoloNames(prev => {
                                  const next = [...prev];
                                  next[slotIdx] = u.username;
                                  return next;
                                });
                                setSuggestions([]);
                                setActiveSlot(null);
                              }}
                              className="w-full text-left px-2 py-1.5 text-sm hover:bg-mahjong-accent/40 transition-colors"
                            >
                              <span className="text-white">{u.username}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleAddPlayer(slotIdx)}
                      disabled={addingIdx === slotIdx || !soloNames[slotIdx]?.trim()}
                      className="px-3 py-1.5 rounded bg-mahjong-accent text-white text-sm font-medium
                        disabled:opacity-30 active:scale-95 transition-transform shrink-0"
                    >
                      {addingIdx === slotIdx ? '...' : t('lobby.add')}
                    </button>
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
                {t('lobby.waitingSlot')}
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
            {t('lobby.readyCount', { n: readyCount })}
            {readyCount === 4 && ` - ${t('lobby.gameStarting')}`}
          </p>
        </div>
      )}

      {/* Rules Island */}
      <RulesIsland
        startingPoints={ruleStarting}
        uma={ruleUma}
        tobiEnabled={ruleTobi}
        okaEnabled={ruleOka}
        kiriageMangan={ruleKiriage}
        doubleRonEnabled={ruleDoubleRon}
        nagashiManganEnabled={ruleNagashi}
        countedYakumanEnabled={ruleCountedYakuman}
        doubleYakumanEnabled={ruleDoubleYakuman}
        scoreFormula={ruleFormula}
        presetName={presetName}
        editable={true}
        onChange={(updates) => {
          const { presetName: newPreset, ...ruleUpdates } = updates;
          if (newPreset !== undefined) setPresetName(newPreset);
          if (Object.keys(ruleUpdates).length > 0) {
            setRuleset(ruleUpdates as Partial<typeof M_LEAGUE_RULES>);
          }
        }}
      />

      {/* Game Tags */}
      <div className="mt-3 px-4 py-2 rounded-xl bg-mahjong-card">
        <p className="text-xs text-mahjong-muted mb-2">{t('lobby.tags')}</p>
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
              placeholder={t('lobby.newTag')}
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
              {t('lobby.startGame')}
            </button>
            {totalPlayers < 4 && (
              <p className="text-center text-xs text-mahjong-muted mt-2">
                {t('lobby.needPlayers', { count: emptySlots })}
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
              {isReady ? t('lobby.cancelReady') : t('lobby.readyUp')}
            </button>
            {totalPlayers < 4 && (
              <p className="text-center text-xs text-mahjong-muted mt-2">
                {t('lobby.waitingPlayers', { count: emptySlots })}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
