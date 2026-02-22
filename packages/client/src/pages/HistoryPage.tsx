import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { listGames, getGame, listPlayerRecords, rebuildPlayerDB, getGameAnnotations, updateGameAnnotations, listTags, adminUpdateGameTags, adminDeleteTag, adminDeleteGame, type GameListItem, type PlayerRecord, type AdminAnnotations } from '../lib/api';
import { useAdminStore } from '../stores/admin-store';
import { useLocale } from '../i18n';

interface GameRecord {
  id: string;
  roomCode: string;
  players: { name: string; initialSeat: string }[];
  hands: {
    handNumber: number;
    round: string;
    dealer: string;
    honba: number;
    result: {
      type: 'agari' | 'ryuukyoku';
      winner?: string;
      loser?: string;
      method?: 'tsumo' | 'ron';
      han?: number;
      fu?: number;
      pointsWon?: number;
      honbaBonus?: number;
      tenpaiPlayers?: string[];
    };
    pointDeltas: Record<string, number>;
  }[];
  finalScores: {
    placement: number;
    name: string;
    rawPoints: number;
    uma: number;
    gameScore: number;
  }[];
  startedAt: string;
  endedAt: string;
  totalHands: number;
  adminAnnotations?: AdminAnnotations;
}

const PLACEMENT_COLORS = ['text-mahjong-gold', 'text-white', 'text-mahjong-muted', 'text-mahjong-highlight'];

type Tab = 'games' | 'players';

export function HistoryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useLocale();
  const initialTab = searchParams.get('tab') === 'players' ? 'players' : 'games';
  const [tab, setTab] = useState<Tab>(initialTab);

  const [games, setGames] = useState<GameListItem[]>([]);
  const [allPlayers, setAllPlayers] = useState<PlayerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [nameFilter, setNameFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [tagFilter, setTagFilter] = useState('');

  // Player search results (for games tab)
  const [matchedPlayers, setMatchedPlayers] = useState<PlayerRecord[]>([]);

  // Expanded game detail
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [expandedRecord, setExpandedRecord] = useState<GameRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Admin state
  const { token: adminToken } = useAdminStore();
  const [editNotes, setEditNotes] = useState('');
  const [annotationSaving, setAnnotationSaving] = useState(false);
  const [annotationSaved, setAnnotationSaved] = useState(false);

  // Rebuilding state
  const [rebuilding, setRebuilding] = useState(false);

  // Tags from API
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  // Retag state
  const [retagFile, setRetagFile] = useState<string | null>(null);
  const [retagTags, setRetagTags] = useState<string[]>([]);
  const [retagSaving, setRetagSaving] = useState(false);

  // Delete state
  const [deleteConfirmFile, setDeleteConfirmFile] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Player sort
  type PlayerSort = 'name' | 'rank' | 'score' | 'games';
  const [playerSort, setPlayerSort] = useState<PlayerSort>('name');

  useEffect(() => {
    Promise.all([
      listGames().then(res => setGames(res.games)),
      loadPlayers(),
      listTags().then(res => setAvailableTags(res.tags)).catch(() => {}),
    ])
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function loadPlayers() {
    const res = await listPlayerRecords();
    if (res.players.length === 0) {
      // Auto-rebuild from existing game files
      await rebuildPlayerDB();
      const res2 = await listPlayerRecords();
      setAllPlayers(res2.players);
    } else {
      setAllPlayers(res.players);
    }
  }

  async function handleRetag(filename: string) {
    if (!adminToken) return;
    setRetagSaving(true);
    try {
      const res = await adminUpdateGameTags(adminToken, filename, retagTags);
      setGames(prev => prev.map(g => g.filename === filename ? { ...g, tags: res.tags } : g));
      setRetagFile(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRetagSaving(false);
    }
  }

  async function handleDeleteTag(tagName: string) {
    if (!adminToken) return;
    try {
      await adminDeleteTag(adminToken, tagName);
      setAvailableTags(prev => prev.filter(t => t !== tagName));
      if (tagFilter === tagName) setTagFilter('');
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleRebuild() {
    setRebuilding(true);
    try {
      await rebuildPlayerDB();
      const res = await listPlayerRecords();
      setAllPlayers(res.players);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRebuilding(false);
    }
  }

  async function handleDeleteGame(filename: string) {
    if (!adminToken) return;
    setDeleting(true);
    try {
      await adminDeleteGame(adminToken, filename);
      setGames(prev => prev.filter(g => g.filename !== filename));
      setDeleteConfirmFile(null);
      if (expandedFile === filename) {
        setExpandedFile(null);
        setExpandedRecord(null);
      }
      // Reload players since player DB was rebuilt on server
      await loadPlayers();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  }

  function switchTab(t: Tab) {
    setTab(t);
    setSearchParams(t === 'players' ? { tab: 'players' } : {});
  }

  // Search players when name filter changes (games tab)
  useEffect(() => {
    const q = nameFilter.trim();
    if (q.length === 0) {
      setMatchedPlayers([]);
      return;
    }
    const timer = setTimeout(() => {
      listPlayerRecords(q)
        .then(res => setMatchedPlayers(res.players))
        .catch(() => setMatchedPlayers([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [nameFilter]);

  async function handleToggle(filename: string) {
    if (expandedFile === filename) {
      setExpandedFile(null);
      setExpandedRecord(null);
      return;
    }

    setExpandedFile(filename);
    setExpandedRecord(null);
    setDetailLoading(true);
    setAnnotationSaved(false);
    try {
      const record = await getGame(filename);
      setExpandedRecord(record);
      setEditNotes(record.adminAnnotations?.notes ?? '');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleToggleOfficial(filename: string, currentValue: boolean) {
    if (!adminToken) return;
    const newValue = !currentValue;
    // Optimistic update in the games list
    setGames(prev => prev.map(g => g.filename === filename ? { ...g, isOfficialGame: newValue } : g));
    try {
      // Get current notes from expanded record if this game is expanded, otherwise fetch
      let notes = '';
      if (expandedFile === filename && expandedRecord) {
        notes = expandedRecord.adminAnnotations?.notes ?? '';
      }
      const res = await updateGameAnnotations(adminToken, filename, {
        isOfficialGame: newValue,
        notes,
      });
      // Update expanded record if it's the same game
      if (expandedFile === filename && expandedRecord) {
        setExpandedRecord({ ...expandedRecord, adminAnnotations: res.annotations });
      }
    } catch {
      // Revert on error
      setGames(prev => prev.map(g => g.filename === filename ? { ...g, isOfficialGame: currentValue } : g));
    }
  }

  async function handleSaveAnnotations() {
    if (!adminToken || !expandedFile) return;
    const game = games.find(g => g.filename === expandedFile);
    setAnnotationSaving(true);
    try {
      const res = await updateGameAnnotations(adminToken, expandedFile, {
        isOfficialGame: game?.isOfficialGame ?? false,
        notes: editNotes,
      });
      if (expandedRecord) {
        setExpandedRecord({ ...expandedRecord, adminAnnotations: res.annotations });
      }
      setAnnotationSaved(true);
      setTimeout(() => setAnnotationSaved(false), 2000);
    } catch {
      // ignore
    } finally {
      setAnnotationSaving(false);
    }
  }

  // Filter games
  const filtered = games.filter(g => {
    // Player name filter (exact match)
    if (nameFilter.trim()) {
      const query = nameFilter.trim().toLowerCase();
      const playerList = g.players.replace(/_/g, ' ').toLowerCase().split('-');
      if (!playerList.some(name => name.trim() === query)) return false;
    }

    // Date range filter (compare date strings: "YYYY-MM-DD HH:mm:SS")
    if (dateFrom) {
      const gameDate = g.date.slice(0, 10); // "YYYY-MM-DD"
      if (gameDate < dateFrom) return false;
    }
    if (dateTo) {
      const gameDate = g.date.slice(0, 10);
      if (gameDate > dateTo) return false;
    }

    // Tag filter
    if (tagFilter && !(g.tags ?? []).includes(tagFilter)) return false;

    return true;
  });

  // Filter players for players tab — recalculate stats when tag filter is active
  const filteredPlayers = (() => {
    let players = nameFilter.trim()
      ? allPlayers.filter(p => p.name.toLowerCase() === nameFilter.trim().toLowerCase())
      : allPlayers;

    if (tagFilter) {
      // Filter to players who have games with this tag, and recalculate stats
      players = players
        .map(p => {
          const tagGames = p.games.filter(g => (g.tags ?? []).includes(tagFilter));
          if (tagGames.length === 0) return null;
          return {
            ...p,
            totalGames: tagGames.length,
            avgPlacement: tagGames.reduce((s, g) => s + g.placement, 0) / tagGames.length,
            avgGameScore: tagGames.reduce((s, g) => s + g.gameScore, 0) / tagGames.length,
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);
    }

    // Apply sorting
    return [...players].sort((a, b) => {
      switch (playerSort) {
        case 'rank': return a.avgPlacement - b.avgPlacement;
        case 'score': return b.avgGameScore - a.avgGameScore;
        case 'games': return b.totalGames - a.totalGames;
        default: return a.name.localeCompare(b.name);
      }
    });
  })();

  function formatHandResult(hand: GameRecord['hands'][0]): string {
    const r = hand.result;
    if (r.type === 'ryuukyoku') {
      const tp = r.tenpaiPlayers?.join(', ') || t('common.none');
      return `${t('history.drawResult')} (tenpai: ${tp})`;
    }
    const method = r.method === 'tsumo' ? t('mahjong.tsumo') : t('mahjong.ron');
    const loserPart = r.loser ? ` ← ${r.loser}` : '';
    const pointsPart = r.pointsWon ? ` +${r.pointsWon.toLocaleString()}` : '';
    const honbaPart = r.honbaBonus ? ` (+${r.honbaBonus} honba)` : '';
    return `${r.winner} ${method}${loserPart} ${r.han}han ${r.fu}fu${pointsPart}${honbaPart}`;
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-mahjong-muted">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col p-4 max-w-md mx-auto">
      {/* Header */}
      <div className="text-center my-6">
        <h1 className="text-3xl font-bold mb-1">{t('history.title')}</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => switchTab('games')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors
            ${tab === 'games' ? 'bg-mahjong-accent text-white' : 'bg-mahjong-card text-mahjong-muted'}`}
        >
          {t('history.gamesTab')} ({games.length})
        </button>
        <button
          onClick={() => switchTab('players')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors
            ${tab === 'players' ? 'bg-mahjong-accent text-white' : 'bg-mahjong-card text-mahjong-muted'}`}
        >
          {t('history.playersTab')} ({allPlayers.length})
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={nameFilter}
          onChange={e => setNameFilter(e.target.value)}
          placeholder={tab === 'games' ? t('history.searchGames') : t('history.searchPlayers')}
          className="w-full px-3 py-2 rounded-lg bg-mahjong-card border border-mahjong-accent
            text-white text-sm focus:outline-none focus:border-mahjong-highlight"
        />
      </div>

      {error && <p className="text-mahjong-highlight text-sm mb-4">{error}</p>}

      {/* === GAMES TAB === */}
      {tab === 'games' && (
        <>
          {/* Date filters */}
          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              <label className="block text-xs text-mahjong-muted mb-1">{t('history.from')}</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-mahjong-card border border-mahjong-accent
                  text-white text-sm focus:outline-none focus:border-mahjong-highlight
                  [color-scheme:dark]"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-mahjong-muted mb-1">{t('history.to')}</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-mahjong-card border border-mahjong-accent
                  text-white text-sm focus:outline-none focus:border-mahjong-highlight
                  [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Tag filter */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <button
              onClick={() => setTagFilter('')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${!tagFilter ? 'bg-mahjong-accent text-white' : 'bg-mahjong-card text-mahjong-muted'}`}
            >
              {t('common.all')}
            </button>
            {availableTags.map((tag: string) => (
              <span key={tag} className="inline-flex items-center gap-1">
                <button
                  onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                    ${tagFilter === tag ? 'bg-mahjong-gold text-mahjong-bg' : 'bg-mahjong-card text-mahjong-muted'}`}
                >
                  {tag}
                </button>
                {adminToken && (
                  <button
                    onClick={() => handleDeleteTag(tag)}
                    className="text-mahjong-highlight/60 hover:text-mahjong-highlight text-xs leading-none"
                    title={`Delete ${tag}`}
                  >
                    x
                  </button>
                )}
              </span>
            ))}
          </div>

          {/* Matched players */}
          {matchedPlayers.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-mahjong-muted mb-2">{t('lobby.players')}</p>
              <div className="flex flex-wrap gap-2">
                {matchedPlayers.map(p => (
                  <button
                    key={p.name}
                    onClick={() => navigate(`/player/${encodeURIComponent(p.name)}`)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-mahjong-accent
                      text-white text-sm active:scale-95 transition-transform"
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-mahjong-muted text-xs">{p.totalGames}{t('history.games')}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Results count */}
          <p className="text-xs text-mahjong-muted mb-3">
            {t('history.gamesCount', { count: filtered.length })}
          </p>

          {/* Game list */}
          <div className="space-y-3 flex-1 mb-6">
            {filtered.length === 0 && (
              <p className="text-center text-mahjong-muted py-8">
                {t('history.noRecords')}
              </p>
            )}
            {filtered.map(g => {
              const isExpanded = expandedFile === g.filename;
              const playerNames = g.players.split('-').join(' · ');

              return (
                <div key={g.filename} className="rounded-xl bg-mahjong-card overflow-hidden">
                  {/* Card header — always visible */}
                  <button
                    onClick={() => handleToggle(g.filename)}
                    className="w-full text-left px-4 py-3 active:bg-mahjong-accent/30 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-mahjong-muted">{g.date}</span>
                      <div className="flex items-center gap-2">
                        {g.interrupted && (
                          <span className="text-xs bg-mahjong-highlight/20 text-mahjong-highlight px-1.5 py-0.5 rounded">
                            {t('history.interrupted')}
                          </span>
                        )}
                        {(g.tags ?? []).length > 0 && (
                          <div className="flex gap-1">
                            {g.tags.map(tag => (
                              <span key={tag} className="text-xs bg-mahjong-gold/20 text-mahjong-gold px-1.5 py-0.5 rounded">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <span className="text-xs font-mono text-mahjong-gold">{g.roomCode}</span>
                      </div>
                    </div>
                    {g.finalScores.length > 0 ? (
                      <div className="space-y-0.5">
                        {g.finalScores.map(s => (
                          <div key={s.name} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <span className={`font-bold w-4 text-center ${PLACEMENT_COLORS[s.placement - 1]}`}>
                                {s.placement}
                              </span>
                              <span className="font-medium">{s.name}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-mahjong-muted font-mono text-xs">
                                {s.rawPoints.toLocaleString()}
                              </span>
                              <span className={`font-mono font-bold text-xs ${
                                s.gameScore >= 0 ? 'text-mahjong-green' : 'text-mahjong-highlight'
                              }`}>
                                {s.gameScore > 0 ? '+' : ''}{s.gameScore.toFixed(1)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm font-medium">{playerNames}</p>
                    )}
                  </button>

                  {/* Admin: inline controls — always visible */}
                  {adminToken && (
                    <div className="px-4 pb-2 -mt-1 space-y-2">
                      <label
                        className="flex items-center gap-2 cursor-pointer"
                        onClick={e => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={g.isOfficialGame}
                          onChange={() => handleToggleOfficial(g.filename, g.isOfficialGame)}
                          className="w-4 h-4 accent-mahjong-gold"
                        />
                        <span className="text-xs text-mahjong-muted">{t('history.officialGame')}</span>
                      </label>
                      {retagFile === g.filename ? (
                        <div className="space-y-1" onClick={e => e.stopPropagation()}>
                          <div className="flex flex-wrap gap-1">
                            {availableTags.map(tag => (
                              <button key={tag}
                                onClick={() => setRetagTags(prev =>
                                  prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                                )}
                                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors
                                  ${retagTags.includes(tag)
                                    ? 'bg-mahjong-gold text-mahjong-bg'
                                    : 'bg-mahjong-bg text-mahjong-muted border border-mahjong-accent'}`}
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleRetag(g.filename)} disabled={retagSaving}
                              className="px-3 py-1 rounded text-xs bg-mahjong-green text-mahjong-bg font-bold disabled:opacity-50">
                              {retagSaving ? '...' : t('common.save')}
                            </button>
                            <button onClick={() => setRetagFile(null)}
                              className="px-3 py-1 rounded text-xs bg-mahjong-card text-mahjong-muted">
                              {t('common.cancel')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); setRetagFile(g.filename); setRetagTags([...(g.tags ?? [])]); }}
                          className="text-xs text-mahjong-muted underline">
                          {t('history.retag')}
                        </button>
                      )}
                      {/* Delete game */}
                      {deleteConfirmFile === g.filename ? (
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          <span className="text-xs text-mahjong-highlight">{t('history.deleteConfirm')}</span>
                          <button
                            onClick={() => handleDeleteGame(g.filename)}
                            disabled={deleting}
                            className="px-2 py-1 rounded text-xs bg-mahjong-highlight text-white font-bold disabled:opacity-50"
                          >
                            {deleting ? t('history.deleting') : t('common.confirm')}
                          </button>
                          <button
                            onClick={() => setDeleteConfirmFile(null)}
                            className="px-2 py-1 rounded text-xs bg-mahjong-card text-mahjong-muted"
                          >
                            {t('common.cancel')}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirmFile(g.filename); }}
                          className="text-xs text-mahjong-highlight/60 hover:text-mahjong-highlight underline"
                        >
                          {t('history.deleteGame')}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-mahjong-accent/30 px-4 py-3">
                      {detailLoading && (
                        <p className="text-mahjong-muted text-sm text-center py-2">{t('common.loading')}</p>
                      )}
                      {expandedRecord && (
                        <>
                          {/* Final scores */}
                          <h3 className="text-xs text-mahjong-muted mb-2">{t('history.finalScores')}</h3>
                          <div className="space-y-1.5 mb-4">
                            {expandedRecord.finalScores.map(s => (
                              <div key={s.name} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                  <span className={`font-bold ${PLACEMENT_COLORS[s.placement - 1]}`}>
                                    {s.placement}
                                  </span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); navigate(`/player/${encodeURIComponent(s.name)}`); }}
                                    className="hover:text-mahjong-gold transition-colors underline underline-offset-2 decoration-mahjong-accent"
                                  >
                                    {s.name}
                                  </button>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-mahjong-muted font-mono text-xs">
                                    {s.rawPoints.toLocaleString()}
                                  </span>
                                  <span className={`font-mono font-bold ${
                                    s.gameScore >= 0 ? 'text-mahjong-green' : 'text-mahjong-highlight'
                                  }`}>
                                    {s.gameScore > 0 ? '+' : ''}{s.gameScore.toFixed(1)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Hand history */}
                          <h3 className="text-xs text-mahjong-muted mb-2">
                            {t('history.handsCount', { count: expandedRecord.totalHands })}
                          </h3>
                          <div className="space-y-1.5">
                            {expandedRecord.hands.map(hand => (
                              <div key={hand.handNumber} className="text-xs">
                                <div className="flex items-start gap-2">
                                  <span className="text-mahjong-gold font-bold shrink-0 w-6">
                                    {hand.round}
                                  </span>
                                  <span className="text-mahjong-muted">
                                    {hand.honba > 0 && `${hand.honba}${t('mahjong.honba')} `}
                                    {formatHandResult(hand)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Existing annotation display (for non-admins or read-only) */}
                          {!adminToken && expandedRecord.adminAnnotations && (
                            <div className="mt-4 pt-3 border-t border-mahjong-accent/30">
                              <p className="text-xs text-mahjong-muted mb-1">{t('history.annotations')}</p>
                              {expandedRecord.adminAnnotations.isOfficialGame && (
                                <span className="text-xs bg-mahjong-gold/20 text-mahjong-gold px-1.5 py-0.5 rounded">
                                  {t('history.officialGame')}
                                </span>
                              )}
                              {expandedRecord.adminAnnotations.notes && (
                                <p className="text-xs text-mahjong-muted mt-1">{expandedRecord.adminAnnotations.notes}</p>
                              )}
                            </div>
                          )}

                          {/* Admin notes panel */}
                          {adminToken && (
                            <div className="mt-4 pt-3 border-t border-mahjong-accent/30 space-y-2">
                              <p className="text-xs text-mahjong-muted font-medium">{t('history.adminNotes')}</p>
                              <textarea
                                value={editNotes}
                                onChange={e => { setEditNotes(e.target.value); setAnnotationSaved(false); }}
                                placeholder={t('results.notes')}
                                rows={2}
                                className="w-full px-2 py-1.5 rounded-lg bg-mahjong-bg border border-mahjong-accent
                                  text-white text-xs focus:outline-none focus:border-mahjong-highlight resize-none"
                              />
                              <button
                                onClick={handleSaveAnnotations}
                                disabled={annotationSaving}
                                className={`w-full py-1.5 rounded-lg font-bold text-xs transition-colors
                                  ${annotationSaved
                                    ? 'bg-mahjong-green text-mahjong-bg'
                                    : 'bg-mahjong-accent text-white'} disabled:opacity-50`}
                              >
                                {annotationSaving ? t('common.saving') : annotationSaved ? t('common.saved') : t('history.saveNotes')}
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* === PLAYERS TAB === */}
      {tab === 'players' && (
        <div className="flex-1 mb-6">
          {/* Tag filter */}
          <div className="flex gap-2 mb-3 flex-wrap">
            <button
              onClick={() => setTagFilter('')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${!tagFilter ? 'bg-mahjong-accent text-white' : 'bg-mahjong-card text-mahjong-muted'}`}
            >
              {t('common.all')}
            </button>
            {availableTags.map((tag: string) => (
              <button
                key={tag}
                onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                  ${tagFilter === tag ? 'bg-mahjong-gold text-mahjong-bg' : 'bg-mahjong-card text-mahjong-muted'}`}
              >
                {tag}
              </button>
            ))}
            {/* Rebuild button */}
            <button
              onClick={handleRebuild}
              disabled={rebuilding}
              className="ml-auto text-xs text-mahjong-muted px-2 py-1.5 rounded bg-mahjong-card
                active:scale-95 transition-transform disabled:opacity-50"
            >
              {rebuilding ? t('history.rebuilding') : t('history.rebuild')}
            </button>
          </div>

          {/* Sort controls */}
          <div className="flex gap-1.5 mb-3">
            {(['name', 'rank', 'score', 'games'] as const).map(s => (
              <button
                key={s}
                onClick={() => setPlayerSort(s)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors
                  ${playerSort === s ? 'bg-mahjong-accent text-white' : 'bg-mahjong-card text-mahjong-muted'}`}
              >
                {t(`history.sortBy${s.charAt(0).toUpperCase() + s.slice(1)}` as any)}
              </button>
            ))}
          </div>

          {filteredPlayers.length === 0 && (
            <p className="text-center text-mahjong-muted py-8">
              {t('history.noPlayerData')}
            </p>
          )}

          <div className="space-y-2">
            {filteredPlayers.map(p => (
              <button
                key={p.name}
                onClick={() => navigate(`/player/${encodeURIComponent(p.name)}`)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-mahjong-card
                  active:bg-mahjong-accent/30 transition-colors text-left"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    {p.isRegistered ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-mahjong-green/20 text-mahjong-green font-bold">
                        {t('player.registered')}
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-mahjong-highlight/20 text-mahjong-highlight font-bold">
                        {t('player.unregistered')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-mahjong-muted mt-0.5">{p.totalGames} {t('history.games')}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono text-mahjong-gold">{p.avgPlacement.toFixed(2)}</p>
                  <p className={`text-xs font-mono ${p.avgGameScore >= 0 ? 'text-mahjong-green' : 'text-mahjong-highlight'}`}>
                    {p.avgGameScore > 0 ? '+' : ''}{p.avgGameScore.toFixed(1)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Back button */}
      <div className="pb-4">
        <button
          onClick={() => navigate('/')}
          className="w-full py-2 text-mahjong-muted text-sm"
        >
          {t('common.backToHome')}
        </button>
      </div>
    </div>
  );
}
