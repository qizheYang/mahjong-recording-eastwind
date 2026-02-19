import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPlayerRecord, listTags, type PlayerRecord, type PlayerGameEntry } from '../lib/api';
import { useLocale } from '../i18n';

type RangeOption = 10 | 20 | 0; // 0 = all

function TrendChart({
  data,
  getValue,
  label,
  formatY,
  color,
  refLine,
}: {
  data: PlayerGameEntry[];
  getValue: (g: PlayerGameEntry) => number;
  label: string;
  formatY: (v: number) => string;
  color: string;
  refLine?: number;
}) {
  if (data.length === 0) return null;

  const values = data.map(getValue);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;

  const W = 320;
  const H = 140;
  const PAD_X = 40;
  const PAD_Y = 20;
  const plotW = W - PAD_X * 2;
  const plotH = H - PAD_Y * 2;

  const points = values.map((v, i) => {
    const x = PAD_X + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
    const y = PAD_Y + plotH - ((v - minV) / range) * plotH;
    return { x, y, v };
  });

  const polyline = points.map(p => `${p.x},${p.y}`).join(' ');

  // Y-axis labels
  const yLabels = [minV, (minV + maxV) / 2, maxV];

  return (
    <div className="mb-4">
      <h3 className="text-xs text-mahjong-muted mb-1">{label}</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 180 }}>
        {/* Grid lines */}
        {yLabels.map((v, i) => {
          const y = PAD_Y + plotH - ((v - minV) / range) * plotH;
          return (
            <g key={i}>
              <line x1={PAD_X} y1={y} x2={W - PAD_X} y2={y} stroke="#333" strokeWidth={0.5} />
              <text x={PAD_X - 4} y={y + 3} textAnchor="end" fill="#8a8a9a" fontSize={8}>
                {formatY(v)}
              </text>
            </g>
          );
        })}

        {/* Reference line */}
        {refLine !== undefined && (
          <line
            x1={PAD_X} y1={PAD_Y + plotH - ((refLine - minV) / range) * plotH}
            x2={W - PAD_X} y2={PAD_Y + plotH - ((refLine - minV) / range) * plotH}
            stroke="#f5c518" strokeWidth={0.5} strokeDasharray="4,3"
          />
        )}

        {/* Area fill */}
        <polygon
          points={`${points[0].x},${PAD_Y + plotH} ${polyline} ${points[points.length - 1].x},${PAD_Y + plotH}`}
          fill={color} opacity={0.1}
        />

        {/* Line */}
        <polyline points={polyline} fill="none" stroke={color} strokeWidth={1.5} />

        {/* Dots */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2} fill={color} />
        ))}

        {/* X-axis labels (first and last game dates) */}
        {data.length > 0 && (
          <>
            <text x={PAD_X} y={H - 2} textAnchor="start" fill="#8a8a9a" fontSize={7}>
              {data[0].date.slice(0, 10)}
            </text>
            {data.length > 1 && (
              <text x={W - PAD_X} y={H - 2} textAnchor="end" fill="#8a8a9a" fontSize={7}>
                {data[data.length - 1].date.slice(0, 10)}
              </text>
            )}
          </>
        )}
      </svg>
    </div>
  );
}

const PLACEMENT_COLORS = ['text-mahjong-gold', 'text-white', 'text-mahjong-muted', 'text-mahjong-highlight'];

export function PlayerPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { t } = useLocale();
  const [player, setPlayer] = useState<PlayerRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState<RangeOption>(0);
  const [tagFilter, setTagFilter] = useState('');
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  useEffect(() => {
    listTags().then(res => setAvailableTags(res.tags)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!name) return;
    setLoading(true);
    getPlayerRecord(name)
      .then(setPlayer)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [name]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-mahjong-muted">{t('common.loading')}</p>
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-4">
        <p className="text-mahjong-highlight mb-4">{error || t('player.notFound')}</p>
        <button onClick={() => navigate('/history')} className="text-mahjong-muted text-sm">
          {t('player.backToHistory')}
        </button>
      </div>
    );
  }

  // Apply tag + range filters
  const allGames = player.games;
  const taggedGames = tagFilter
    ? allGames.filter(g => (g.tags ?? []).includes(tagFilter))
    : allGames;
  const displayGames = range === 0 ? taggedGames : taggedGames.slice(-range);

  // Stats for displayed games
  const avgPlacement = displayGames.length > 0
    ? displayGames.reduce((s, g) => s + g.placement, 0) / displayGames.length
    : 0;
  const avgScore = displayGames.length > 0
    ? displayGames.reduce((s, g) => s + g.gameScore, 0) / displayGames.length
    : 0;
  const placementCounts = [0, 0, 0, 0];
  displayGames.forEach(g => { placementCounts[g.placement - 1]++; });

  return (
    <div className="min-h-dvh flex flex-col p-4 max-w-md mx-auto">
      {/* Header */}
      <div className="text-center my-6">
        <h1 className="text-2xl font-bold">{player.name}</h1>
        {player.phone && (
          <p className="text-mahjong-muted text-sm mt-1">{player.phone}</p>
        )}
        <p className="text-mahjong-muted text-xs mt-1">
          {t('player.gamesPlayed', { count: player.totalGames })}
        </p>
      </div>

      {/* Tag filter */}
      <div className="flex gap-2 mb-3 justify-center flex-wrap">
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
      </div>

      {/* Range selector */}
      <div className="flex gap-2 mb-4 justify-center">
        {([10, 20, 0] as RangeOption[]).map(r => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${range === r
                ? 'bg-mahjong-accent text-white'
                : 'bg-mahjong-card text-mahjong-muted'}`}
          >
            {r === 0 ? t('player.allGames', { count: taggedGames.length }) : t('player.lastN', { count: r })}
          </button>
        ))}
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-mahjong-card rounded-lg p-3 text-center">
          <p className="text-xs text-mahjong-muted mb-1">{t('player.avgRank')}</p>
          <p className="text-xl font-bold text-mahjong-gold">{avgPlacement.toFixed(2)}</p>
        </div>
        <div className="bg-mahjong-card rounded-lg p-3 text-center">
          <p className="text-xs text-mahjong-muted mb-1">{t('player.avgScore')}</p>
          <p className={`text-xl font-bold ${avgScore >= 0 ? 'text-mahjong-green' : 'text-mahjong-highlight'}`}>
            {avgScore > 0 ? '+' : ''}{avgScore.toFixed(1)}
          </p>
        </div>
      </div>

      {/* Placement distribution */}
      <div className="bg-mahjong-card rounded-lg p-3 mb-6">
        <p className="text-xs text-mahjong-muted mb-2">{t('player.placementDist')}</p>
        <div className="flex gap-3 justify-around">
          {placementCounts.map((count, i) => (
            <div key={i} className="text-center">
              <span className={`text-lg font-bold ${PLACEMENT_COLORS[i]}`}>{t(`results.placement.${i + 1}`)}</span>
              <p className="text-sm text-mahjong-muted">{count}{t('player.times')}</p>
              <p className="text-xs text-mahjong-muted">
                {displayGames.length > 0 ? ((count / displayGames.length) * 100).toFixed(0) : 0}%
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Trendline charts */}
      {displayGames.length > 1 && (
        <>
          <TrendChart
            data={displayGames}
            getValue={g => g.placement}
            label={t('player.placementTrend')}
            formatY={v => v.toFixed(0)}
            color="#f5c518"
            refLine={2.5}
          />
          <TrendChart
            data={displayGames}
            getValue={g => g.rawPoints}
            label={t('player.rawPointsTrend')}
            formatY={v => (v / 1000).toFixed(0) + 'k'}
            color="#4ecca3"
            refLine={25000}
          />
        </>
      )}

      {/* Game list */}
      <h3 className="text-xs text-mahjong-muted mb-2">
        {t('player.gameListCount', { count: displayGames.length })}
      </h3>
      <div className="space-y-2 mb-6">
        {[...displayGames].reverse().map((g, i) => (
          <div key={i} className="flex items-center justify-between bg-mahjong-card rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <span className={`font-bold w-5 text-center ${PLACEMENT_COLORS[g.placement - 1]}`}>
                {g.placement}
              </span>
              <div>
                <div className="flex items-center gap-1">
                  <p className="text-xs text-mahjong-muted">{g.date.slice(0, 10)}</p>
                  {(g.tags ?? []).map(tag => (
                    <span key={tag} className="text-[10px] bg-mahjong-gold/20 text-mahjong-gold px-1 py-0.5 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-mahjong-muted/60">
                  {g.playerNames.filter(n => n !== player.name).join(', ')}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-mono text-mahjong-muted">
                {g.rawPoints.toLocaleString()}
              </p>
              <p className={`text-sm font-mono font-bold ${
                g.gameScore >= 0 ? 'text-mahjong-green' : 'text-mahjong-highlight'
              }`}>
                {g.gameScore > 0 ? '+' : ''}{g.gameScore.toFixed(1)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Back button */}
      <div className="pb-4">
        <button
          onClick={() => navigate('/history')}
          className="w-full py-2 text-mahjong-muted text-sm"
        >
          {t('player.backToHistory')}
        </button>
      </div>
    </div>
  );
}
