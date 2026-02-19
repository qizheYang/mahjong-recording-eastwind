import type { Hand, GamePlayer } from '@mahjong/shared';
import { formatRound, formatDelta } from '../../lib/format';
import { useLocale } from '../../i18n';

interface Props {
  hands: Hand[];
  players: GamePlayer[];
}

export function HandHistory({ hands, players }: Props) {
  const { t } = useLocale();

  if (hands.length === 0) {
    return (
      <p className="text-center text-mahjong-muted text-sm py-4">
        {t('hand.noRecords')}
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
                {formatRound(hand.round, t)}
                {hand.honba > 0 && ` ${hand.honba}${t('mahjong.honba')}`}
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
                    {r.isTsumo ? t('hand.tsumo') : t('hand.ron')}
                  </span>
                  {!r.isTsumo && r.loserIndex !== null && (
                    <span className="text-mahjong-muted">
                      {' '}← {players[r.loserIndex]?.name}
                    </span>
                  )}
                </p>
                <p className="text-xs text-mahjong-muted mt-1">
                  {t('hand.hanFuPoints', { han: r.han, fu: r.fu, points: r.pointsWon.toLocaleString() })}
                  {r.honbaBonus > 0 && ` ${t('hand.honbaBonus', { points: r.honbaBonus })}`}
                  {r.riichiSticksCollected > 0 && ` ${t('hand.riichiBonus', { points: r.riichiSticksCollected * 1000 })}`}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-mahjong-muted">
                  {t('hand.draw')}
                </p>
                <p className="text-xs text-mahjong-muted mt-1">
                  {t('hand.tenpaiLabel')} {r.tenpaiStatus.map((tp, i) =>
                    tp ? players[i]?.name : null
                  ).filter(Boolean).join(', ') || t('common.none')}
                </p>
              </div>
            )}

            {hand.riichiPlayers?.some(Boolean) && (
              <p className="text-xs text-mahjong-gold mt-1">
                {t('hand.riichiLabel')} {hand.riichiPlayers.map((r, i) => r ? players[i]?.name : null).filter(Boolean).join(', ')}
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
