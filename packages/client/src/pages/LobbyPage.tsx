import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useGameStore } from '../stores/game-store';
import { addPlayer, removePlayer, killRoom, listTags, createTag, searchRegisteredUsers, type RegisteredUser } from '../lib/api';
import { WINDS, M_LEAGUE_RULES, defaultScoreFormula } from '@mahjong/shared';
import type { PresetName, Wind } from '@mahjong/shared';
import { RulesIsland } from '../components/game/RulesIsland';
import { useLocale } from '../i18n';

export function LobbyPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { t } = useLocale();
  const {
    room, game, playerId, connected, customRuleset, gameTags, teamAssignments, windAssignments,
    customStartingPointsEnabled, playerStartingPoints,
    roomCode: storeRoomCode, errorCode,
    connect, toggleReady, swapSeats, startGame, setSession, setRuleset, toggleTag,
    setTeamAssignment, clearTeamAssignments, setWindAssignment, clearWindAssignments,
    setCustomStartingPointsEnabled, setPlayerStartingPoints, clearError, leaveRoom,
  } = useGameStore();

  const [copied, setCopied] = useState(false);
  const [selectedSwap, setSelectedSwap] = useState<string | null>(null);

  // Solo mode state
  const [soloMode, setSoloMode] = useState(false);
  const [soloNames, setSoloNames] = useState(['', '', '']);
  const [addingIdx, setAddingIdx] = useState<number | null>(null);
  const [soloError, setSoloError] = useState('');

  // Custom team names (editable in 2v2 mode)
  const [teamNames, setTeamNames] = useState<[string, string]>(() => [t('lobby.teamA'), t('lobby.teamB')]);

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

  // Registration status check for current player
  const [isPlayerRegistered, setIsPlayerRegistered] = useState<boolean | null>(null);

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
    const storedRoom = localStorage.getItem('roomCode');
    const storedPlayer = localStorage.getItem('playerId');
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

  // Redirect on room killed or session invalidated
  useEffect(() => {
    if (errorCode === 'ROOM_KILLED') {
      clearError();
      navigate('/');
    }
  }, [errorCode, clearError, navigate]);

  useEffect(() => {
    if (!storeRoomCode && !playerId) {
      navigate('/', { replace: true });
    }
  }, [storeRoomCode, playerId, navigate]);

  function handleCopyCode() {
    navigator.clipboard.writeText(roomCode || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleRenameTeam(teamIdx: 0 | 1, newName: string) {
    const oldName = teamNames[teamIdx];
    const updated: [string, string] = [...teamNames] as [string, string];
    updated[teamIdx] = newName;
    setTeamNames(updated);
    // Update all player assignments that referenced the old name
    if (oldName !== newName && room) {
      for (const p of room.players) {
        if (teamAssignments[p.id] === oldName) {
          setTeamAssignment(p.id, newName);
        }
      }
    }
  }

  function handlePlayerTap(tappedPlayerId: string) {
    if (totalPlayers < 2) return;

    if (!selectedSwap) {
      setSelectedSwap(tappedPlayerId);
    } else if (selectedSwap === tappedPlayerId) {
      setSelectedSwap(null);
    } else {
      // In team mode, swap team and wind assignments between the two players
      if (ruleTeamMode) {
        const teamA = teamAssignments[selectedSwap];
        const teamB = teamAssignments[tappedPlayerId];
        if (teamA && teamB) {
          setTeamAssignment(selectedSwap, teamB);
          setTeamAssignment(tappedPlayerId, teamA);
        }
        const windA = windAssignments[selectedSwap];
        const windB = windAssignments[tappedPlayerId];
        if (windA && windB) {
          setWindAssignment(selectedSwap, windB);
          setWindAssignment(tappedPlayerId, windA);
        }
      } else {
        swapSeats(selectedSwap, tappedPlayerId);
      }
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

  async function handleRemovePlayer(targetPlayerId: string) {
    if (!roomCode) return;
    setSoloError('');
    try {
      await removePlayer(roomCode, targetPlayerId);
      // Server broadcasts player_left → room state updates via WS
    } catch (e: any) {
      setSoloError(e.message);
    }
  }

  async function handleKillRoom() {
    if (!roomCode || !playerId) return;
    if (!window.confirm(t('lobby.killRoomConfirm'))) return;
    try {
      await killRoom(roomCode, playerId);
      leaveRoom();
      navigate('/');
    } catch { /* room may already be gone */ leaveRoom(); navigate('/'); }
  }

  function handleSoloStart() {
    if (!room || room.players.length !== 4) return;
    // In team mode with wind assignments, use wind-based seat order
    if (ruleTeamMode && Object.keys(windAssignments).length === 4) {
      const seatOrder = WINDS.map(w =>
        room.players.find(p => windAssignments[p.id] === w)!.id
      );
      startGame(seatOrder);
    } else {
      const seatOrder = room.players.map(p => p.id);
      startGame(seatOrder);
    }
  }

  const myPlayer = room?.players.find(p => p.id === playerId);

  useEffect(() => {
    if (!myPlayer) return;
    searchRegisteredUsers(myPlayer.name).then(res => {
      setIsPlayerRegistered(res.users.some(u => u.username.toLowerCase() === myPlayer.name.toLowerCase()));
    }).catch(() => {});
  }, [myPlayer?.name]);

  const isReady = myPlayer?.ready ?? false;
  const readyCount = room?.players.filter(p => p.ready).length ?? 0;
  const totalPlayers = room?.players.length ?? 0;
  const anyReady = readyCount > 0;
  const emptySlots = 4 - totalPlayers;

  // Auto-enable solo mode when returning from a game (all 4 players already present)
  useEffect(() => {
    if (room && room.status === 'waiting' && room.players.length === 4 && !soloMode) {
      setSoloMode(true);
    }
  }, [room?.status, room?.players.length]);

  // Solo mode is only available when creator is the only player or returning for new game
  const canToggleSolo = totalPlayers === 1 || totalPlayers === 4;

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
  const ruleMultipleYakuman = (customRuleset.multipleYakumanEnabled ?? M_LEAGUE_RULES.multipleYakumanEnabled);
  const ruleFormula = (customRuleset.scoreFormula ?? M_LEAGUE_RULES.scoreFormula);
  const ruleTeamMode = (customRuleset.teamMode ?? false);

  // Team validation helper
  const isTeamsValid = (() => {
    if (!ruleTeamMode) return true;
    const counts = new Map<string, number>();
    for (const team of Object.values(teamAssignments)) {
      counts.set(team, (counts.get(team) || 0) + 1);
    }
    return Object.keys(teamAssignments).length === 4 && counts.size === 2 && [...counts.values()].every(c => c === 2);
  })();

  // Wind assignment validation (no duplicates)
  const isWindsValid = (() => {
    if (!ruleTeamMode) return true;
    const winds = Object.values(windAssignments);
    return winds.length === 4 && new Set(winds).size === 4;
  })();

  // Auto-assign default teams and winds when team mode is toggled on with 4 players
  useEffect(() => {
    if (ruleTeamMode && room && room.players.length === 4 && Object.keys(teamAssignments).length === 0) {
      room.players.forEach((p, i) => {
        setTeamAssignment(p.id, i < 2 ? teamNames[0] : teamNames[1]);
        setWindAssignment(p.id, WINDS[i]);
      });
    }
  }, [ruleTeamMode, room?.players.length]);

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
            onClick={() => { leaveRoom(); navigate('/'); }}
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

      {/* Kill room button — only for creator */}
      {playerId === room?.creatorId && (
        <div className="text-center mb-2">
          <button
            onClick={handleKillRoom}
            className="text-xs text-mahjong-highlight/60 hover:text-mahjong-highlight
              px-3 py-1 rounded bg-mahjong-highlight/10 active:scale-95 transition-all"
          >
            {t('lobby.killRoom')}
          </button>
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

        {/* Team mode with 4 players: side-by-side 2x2 grid */}
        {ruleTeamMode && totalPlayers === 4 && room ? (
          <div className="space-y-3">
            {teamNames.map((teamName, teamIdx) => {
              const teamPlayers = room.players
                .filter(p => teamAssignments[p.id] === teamName);

              return (
                <div key={teamIdx} className={`rounded-xl border overflow-hidden
                  ${teamIdx === 0 ? 'border-mahjong-green/40' : 'border-mahjong-gold/40'}`}>
                  {/* Team header — editable name */}
                  <div className={`px-3 py-1.5 flex items-center justify-between
                    ${teamIdx === 0 ? 'bg-mahjong-green/15' : 'bg-mahjong-gold/15'}`}>
                    <input
                      type="text"
                      value={teamName}
                      onChange={(e) => handleRenameTeam(teamIdx as 0 | 1, e.target.value)}
                      maxLength={12}
                      className={`text-sm font-bold bg-transparent border-none outline-none w-24
                        ${teamIdx === 0 ? 'text-mahjong-green' : 'text-mahjong-gold'}
                        placeholder:text-mahjong-muted/50`}
                      placeholder={teamIdx === 0 ? t('lobby.teamA') : t('lobby.teamB')}
                    />
                    <span className="text-xs text-mahjong-muted">{teamPlayers.length}/2</span>
                  </div>
                  {/* Team members — side by side */}
                  <div className="p-2 grid grid-cols-2 gap-2">
                    {teamPlayers.map((player) => {
                      const isSelected = selectedSwap === player.id;
                      const currentWind = windAssignments[player.id] ?? 'east';
                      return (
                        <div
                          key={player.id}
                          onClick={() => canSwap ? handlePlayerTap(player.id) : undefined}
                          className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg
                            transition-all text-center
                            ${isSelected
                              ? 'bg-mahjong-gold/30 ring-2 ring-mahjong-gold'
                              : player.id === playerId
                                ? 'bg-mahjong-accent'
                                : 'bg-mahjong-card'}
                            ${canSwap ? 'cursor-pointer active:scale-[0.98]' : ''}`}
                        >
                          {/* Wind selector */}
                          <select
                            value={currentWind}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              setWindAssignment(player.id, e.target.value as Wind);
                            }}
                            className="bg-mahjong-bg border border-mahjong-accent rounded px-1.5 py-0.5
                              text-mahjong-gold text-sm font-bold text-center cursor-pointer
                              focus:outline-none focus:border-mahjong-gold"
                          >
                            {WINDS.map(w => (
                              <option key={w} value={w}>{t(`mahjong.wind.${w}`)}</option>
                            ))}
                          </select>
                          {/* Player name */}
                          <span className="font-medium text-sm truncate w-full">{player.name}</span>
                          {/* Actions row */}
                          <div className="flex items-center gap-1">
                            {player.id === playerId && (
                              <span className="text-[10px] text-mahjong-muted">{t('lobby.you')}</span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const otherTeam = teamNames[teamIdx === 0 ? 1 : 0];
                                setTeamAssignment(player.id, otherTeam);
                              }}
                              className="text-xs text-mahjong-muted hover:text-white px-1 py-0.5
                                rounded bg-mahjong-bg/50 active:scale-95 transition-all"
                              title={t('lobby.assignTeam')}
                            >
                              ⇄
                            </button>
                            {soloMode && player.id !== playerId && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRemovePlayer(player.id); }}
                                className="text-[10px] text-mahjong-highlight/60 hover:text-mahjong-highlight px-1 py-0.5
                                  rounded bg-mahjong-highlight/10 active:scale-95 transition-all"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {/* Placeholder if team has < 2 members */}
                    {teamPlayers.length < 2 && (
                      <div className="flex items-center justify-center px-2 py-2 rounded-lg
                        bg-mahjong-card/50 border border-dashed border-mahjong-accent/30 text-mahjong-muted text-sm">
                        ⇄
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {/* Wind conflict warning */}
            {(() => {
              const winds = Object.values(windAssignments);
              const hasDuplicateWinds = winds.length === 4 && new Set(winds).size < 4;
              return hasDuplicateWinds ? (
                <p className="text-xs text-mahjong-highlight text-center">{t('lobby.windConflict')}</p>
              ) : null;
            })()}
            {Object.keys(teamAssignments).length === 4 && !isTeamsValid && (
              <p className="text-xs text-mahjong-highlight text-center">{t('lobby.teamValidation')}</p>
            )}
          </div>
        ) : (
          /* Normal flat player list (non-team mode or < 4 players) */
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
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="w-6 text-center text-sm font-bold text-mahjong-gold shrink-0">
                      {t(`mahjong.wind.${WINDS[idx]}`)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{player.name}</span>
                      <input
                        type="text"
                        value={teamAssignments[player.id] ?? ''}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          if (e.target.value) {
                            setTeamAssignment(player.id, e.target.value);
                          } else {
                            // Clear assignment when empty
                            setTeamAssignment(player.id, '');
                          }
                        }}
                        maxLength={12}
                        placeholder={t('lobby.teamOptional')}
                        className="block w-full mt-0.5 px-0 py-0 text-xs bg-transparent border-none outline-none
                          text-mahjong-muted placeholder:text-mahjong-muted/30"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {player.id === playerId && (
                      <span className="text-xs text-mahjong-muted">{t('lobby.you')}</span>
                    )}
                    {soloMode && player.id !== playerId && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemovePlayer(player.id); }}
                        className="text-xs text-mahjong-highlight/60 hover:text-mahjong-highlight px-1.5 py-0.5
                          rounded bg-mahjong-highlight/10 active:scale-95 transition-all"
                      >
                        {t('lobby.removePlayer')}
                      </button>
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
        )}
      </div>

      {/* Registration hint for unregistered players */}
      {isPlayerRegistered === false && (
        <Link
          to="/register"
          className="block text-center text-xs text-mahjong-muted bg-mahjong-card rounded-lg px-3 py-2 mb-3
            hover:text-mahjong-gold transition-colors"
        >
          {t('lobby.registerHint')} →
        </Link>
      )}

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
        multipleYakumanEnabled={ruleMultipleYakuman}
        scoreFormula={ruleFormula}
        teamMode={ruleTeamMode}
        presetName={presetName}
        editable={true}
        onChange={(updates) => {
          const { presetName: newPreset, ...ruleUpdates } = updates;
          if (newPreset !== undefined) setPresetName(newPreset);
          if (Object.keys(ruleUpdates).length > 0) {
            setRuleset(ruleUpdates as Partial<typeof M_LEAGUE_RULES>);
          }
          // Clear team/wind assignments when team mode is toggled off
          if ('teamMode' in updates && !updates.teamMode) {
            clearTeamAssignments();
            clearWindAssignments();
            setTeamNames([t('lobby.teamA'), t('lobby.teamB')]);
          }
        }}
      />

      {/* Custom Starting Points per Player */}
      {totalPlayers === 4 && room && (
        <div className="mt-3 px-4 py-2 rounded-xl bg-mahjong-card">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-white">{t('lobby.customStartingPoints')}</span>
              <p className="text-xs text-mahjong-muted">{t('lobby.customStartingPointsDesc')}</p>
            </div>
            <button
              onClick={() => setCustomStartingPointsEnabled(!customStartingPointsEnabled)}
              className={`w-11 h-6 rounded-full p-0.5 transition-colors flex items-center
                ${customStartingPointsEnabled ? 'bg-mahjong-gold' : 'bg-mahjong-bg border border-mahjong-accent'}`}
            >
              <span className={`w-5 h-5 rounded-full bg-white block transition-transform
                ${customStartingPointsEnabled ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>
          {customStartingPointsEnabled && (
            <div className="mt-3 space-y-2">
              {room.players.map((player, idx) => (
                <div key={player.id} className="flex items-center gap-2">
                  <span className="w-6 text-center text-sm font-bold text-mahjong-gold shrink-0">
                    {t(`mahjong.wind.${WINDS[idx]}`)}
                  </span>
                  <span className="text-sm text-white flex-1 truncate">{player.name}</span>
                  <input
                    type="number"
                    value={playerStartingPoints[player.id] ?? ruleStarting}
                    onChange={e => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v)) setPlayerStartingPoints(player.id, v);
                    }}
                    className="w-28 px-2 py-1.5 rounded-lg bg-mahjong-bg border border-mahjong-accent
                      text-white text-sm font-mono text-right focus:outline-none focus:border-mahjong-highlight"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
              disabled={totalPlayers < 4 || !isTeamsValid || !isWindsValid}
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
