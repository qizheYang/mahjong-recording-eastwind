import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { listGames, getGame, listPlayerRecords, rebuildPlayerDB, type GameListItem, type PlayerRecord } from '../lib/api';

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
}

const PLACEMENT_COLORS = ['text-mahjong-gold', 'text-white', 'text-mahjong-muted', 'text-mahjong-highlight'];

type Tab = 'games' | 'players';

export function HistoryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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

  // Player search results (for games tab)
  const [matchedPlayers, setMatchedPlayers] = useState<PlayerRecord[]>([]);

  // Expanded game detail
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [expandedRecord, setExpandedRecord] = useState<GameRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Rebuilding state
  const [rebuilding, setRebuilding] = useState(false);

  useEffect(() => {
    Promise.all([
      listGames().then(res => setGames(res.games)),
      loadPlayers(),
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
    try {
      const record = await getGame(filename);
      setExpandedRecord(record);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDetailLoading(false);
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

    return true;
  });

  // Filter players for players tab
  const filteredPlayers = nameFilter.trim()
    ? allPlayers.filter(p => p.name.toLowerCase() === nameFilter.trim().toLowerCase())
    : allPlayers;

  function formatHandResult(hand: GameRecord['hands'][0]): string {
    const r = hand.result;
    if (r.type === 'ryuukyoku') {
      const tp = r.tenpaiPlayers?.join(', ') || 'none';
      return `流局 Draw (tenpai: ${tp})`;
    }
    const method = r.method === 'tsumo' ? 'Tsumo' : 'Ron';
    const loserPart = r.loser ? ` ← ${r.loser}` : '';
    const pointsPart = r.pointsWon ? ` +${r.pointsWon.toLocaleString()}` : '';
    const honbaPart = r.honbaBonus ? ` (+${r.honbaBonus} honba)` : '';
    return `${r.winner} ${method}${loserPart} ${r.han}han ${r.fu}fu${pointsPart}${honbaPart}`;
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-mahjong-muted">加载中... Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col p-4 max-w-md mx-auto">
      {/* Header */}
      <div className="text-center my-6">
        <h1 className="text-3xl font-bold mb-1">对局记录</h1>
        <p className="text-mahjong-muted text-sm">Game History</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => switchTab('games')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors
            ${tab === 'games' ? 'bg-mahjong-accent text-white' : 'bg-mahjong-card text-mahjong-muted'}`}
        >
          对局 Games ({games.length})
        </button>
        <button
          onClick={() => switchTab('players')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors
            ${tab === 'players' ? 'bg-mahjong-accent text-white' : 'bg-mahjong-card text-mahjong-muted'}`}
        >
          玩家 Players ({allPlayers.length})
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={nameFilter}
          onChange={e => setNameFilter(e.target.value)}
          placeholder={tab === 'games' ? '搜索玩家名称 (精确匹配)...' : '搜索玩家 Search player...'}
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
              <label className="block text-xs text-mahjong-muted mb-1">从 From</label>
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
              <label className="block text-xs text-mahjong-muted mb-1">到 To</label>
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

          {/* Matched players */}
          {matchedPlayers.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-mahjong-muted mb-2">玩家 Players</p>
              <div className="flex flex-wrap gap-2">
                {matchedPlayers.map(p => (
                  <button
                    key={p.name}
                    onClick={() => navigate(`/player/${encodeURIComponent(p.name)}`)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-mahjong-accent
                      text-white text-sm active:scale-95 transition-transform"
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-mahjong-muted text-xs">{p.totalGames}局</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Results count */}
          <p className="text-xs text-mahjong-muted mb-3">
            {filtered.length} 场对局 {filtered.length !== 1 ? 'games' : 'game'} found
          </p>

          {/* Game list */}
          <div className="space-y-3 flex-1 mb-6">
            {filtered.length === 0 && (
              <p className="text-center text-mahjong-muted py-8">
                暂无记录 No records found
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
                      <span className="text-xs font-mono text-mahjong-gold">{g.roomCode}</span>
                    </div>
                    <p className="text-sm font-medium">{playerNames}</p>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-mahjong-accent/30 px-4 py-3">
                      {detailLoading && (
                        <p className="text-mahjong-muted text-sm text-center py-2">加载中...</p>
                      )}
                      {expandedRecord && (
                        <>
                          {/* Final scores */}
                          <h3 className="text-xs text-mahjong-muted mb-2">最终成绩 Final Scores</h3>
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
                            对局详情 Hands ({expandedRecord.totalHands})
                          </h3>
                          <div className="space-y-1.5">
                            {expandedRecord.hands.map(hand => (
                              <div key={hand.handNumber} className="text-xs">
                                <div className="flex items-start gap-2">
                                  <span className="text-mahjong-gold font-bold shrink-0 w-6">
                                    {hand.round}
                                  </span>
                                  <span className="text-mahjong-muted">
                                    {hand.honba > 0 && `${hand.honba}本場 `}
                                    {formatHandResult(hand)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
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
          {/* Rebuild button */}
          <div className="flex justify-end mb-3">
            <button
              onClick={handleRebuild}
              disabled={rebuilding}
              className="text-xs text-mahjong-muted px-2 py-1 rounded bg-mahjong-card
                active:scale-95 transition-transform disabled:opacity-50"
            >
              {rebuilding ? '重建中...' : '重建数据 Rebuild'}
            </button>
          </div>

          {filteredPlayers.length === 0 && (
            <p className="text-center text-mahjong-muted py-8">
              暂无玩家数据 No player data
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
                  <span className="font-medium">{p.name}</span>
                  {p.phone && <span className="text-xs text-mahjong-muted ml-2">{p.phone}</span>}
                  <p className="text-xs text-mahjong-muted mt-0.5">{p.totalGames} 局 games</p>
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
          返回首页 Back to Home
        </button>
      </div>
    </div>
  );
}
