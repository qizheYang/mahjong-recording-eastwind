import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listGames, getGame, listPlayerRecords, type GameListItem, type PlayerRecord } from '../lib/api';

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

export function HistoryPage() {
  const navigate = useNavigate();
  const [games, setGames] = useState<GameListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [nameFilter, setNameFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Player search results
  const [matchedPlayers, setMatchedPlayers] = useState<PlayerRecord[]>([]);

  // Expanded game detail
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [expandedRecord, setExpandedRecord] = useState<GameRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    listGames()
      .then(res => setGames(res.games))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Search players when name filter changes
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

      {/* Filters */}
      <div className="space-y-3 mb-6">
        <div>
          <label className="block text-xs text-mahjong-muted mb-1">搜索玩家 Search Player</label>
          <input
            type="text"
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
            placeholder="输入玩家名称..."
            className="w-full px-3 py-2 rounded-lg bg-mahjong-card border border-mahjong-accent
              text-white text-sm focus:outline-none focus:border-mahjong-highlight"
          />
        </div>
        <div className="flex gap-3">
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
      </div>

      {error && <p className="text-mahjong-highlight text-sm mb-4">{error}</p>}

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
