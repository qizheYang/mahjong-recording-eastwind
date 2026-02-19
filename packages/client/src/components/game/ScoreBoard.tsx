import type { GamePlayer } from '@mahjong/shared';
import { WINDS } from '@mahjong/shared';
import { formatPoints } from '../../lib/format';
import { useLocale } from '../../i18n';

interface Props {
  players: GamePlayer[];
  currentDealer: number;
  currentRoundWind: 'east' | 'south';
}

export function ScoreBoard({ players, currentDealer, currentRoundWind }: Props) {
  const { t } = useLocale();

  return (
    <div className="grid grid-cols-2 gap-2">
      {players.map((player, idx) => {
        const isDealer = idx === currentDealer;
        const seatWind = WINDS[(idx - currentDealer + 4) % 4];

        return (
          <div
            key={player.id}
            className={`relative p-3 rounded-lg ${
              isDealer ? 'bg-mahjong-accent ring-1 ring-mahjong-gold' : 'bg-mahjong-card'
            }`}
          >
            {/* Wind badge */}
            <span className={`absolute top-1 right-2 text-xs font-bold ${
              isDealer ? 'text-mahjong-gold' : 'text-mahjong-muted'
            }`}>
              {t(`mahjong.wind.${seatWind}`)}
            </span>

            {/* Player name */}
            <p className="text-sm text-mahjong-muted truncate pr-6">{player.name}</p>

            {/* Points */}
            <p className={`text-2xl font-bold font-mono ${
              player.points >= 25000 ? 'text-white' :
              player.points >= 0 ? 'text-mahjong-gold' :
              'text-mahjong-highlight'
            }`}>
              {formatPoints(player.points)}
            </p>

            {/* Dealer indicator */}
            {isDealer && (
              <span className="absolute bottom-1 right-2 text-xs text-mahjong-gold">
                {t('mahjong.dealer')}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
