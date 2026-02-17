import type { Hand, GamePlayer } from '@mahjong/shared';
import { formatRound, formatDelta } from '../../lib/format';

interface Props {
  hands: Hand[];
  players: GamePlayer[];
}

export function HandHistory({ hands, players }: Props) {
  if (hands.length === 0) {
    return (
      <p className="text-center text-mahjong-muted text-sm py-4">
        暂无记录 No records yet
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {[...hands].reverse().map((hand) => {
        const r = hand.result;
        return (
          <div key={hand.id} className="bg-mahjong-card rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-mahjong-muted">
                {formatRound(hand.round)}
                {hand.honba > 0 && ` ${hand.honba}本场`}
              </span>
              <span className="text-xs text-mahjong-muted">#{hand.handNumber}</span>
            </div>

            {r.type === 'agari' ? (
              <div>
                <p className="text-sm">
                  <span className="text-mahjong-green font-medium">
                    {players[r.winnerIndex]?.name}
                  </span>
                  {' '}
                  <span className="text-mahjong-gold">
                    {r.isTsumo ? 'Tsumo 自摸' : 'Ron 荣和'}
                  </span>
                  {!r.isTsumo && r.loserIndex !== null && (
                    <span className="text-mahjong-muted">
                      {' '}← {players[r.loserIndex]?.name}
                    </span>
                  )}
                </p>
                <p className="text-xs text-mahjong-muted mt-1">
                  {r.han}han {r.fu}fu = {r.pointsWon.toLocaleString()}点
                  {r.honbaBonus > 0 && ` +${r.honbaBonus} honba`}
                  {r.riichiSticksCollected > 0 && ` +${r.riichiSticksCollected * 1000} riichi`}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-mahjong-muted">
                  流局 Draw
                </p>
                <p className="text-xs text-mahjong-muted mt-1">
                  聴牌: {r.tenpaiStatus.map((t, i) =>
                    t ? players[i]?.name : null
                  ).filter(Boolean).join(', ') || '无 None'}
                </p>
              </div>
            )}

            {hand.riichiPlayers?.some(Boolean) && (
              <p className="text-xs text-mahjong-gold mt-1">
                立直: {hand.riichiPlayers.map((r, i) => r ? players[i]?.name : null).filter(Boolean).join(', ')}
              </p>
            )}

            {/* Point deltas */}
            <div className="flex gap-2 mt-2">
              {hand.pointsAfter.map((after, i) => {
                const delta = after - hand.pointsBefore[i];
                if (delta === 0) return null;
                return (
                  <span
                    key={i}
                    className={`text-xs ${delta > 0 ? 'text-mahjong-green' : 'text-mahjong-highlight'}`}
                  >
                    {players[i]?.name}: {formatDelta(delta)}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
