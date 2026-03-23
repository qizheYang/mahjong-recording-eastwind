import type { GamePlayer } from '@mahjong/shared';
import { WINDS } from '@mahjong/shared';
import { formatPoints } from '../../lib/format';
import { useLocale } from '../../i18n';

interface Props {
  players: GamePlayer[];
  currentDealer: number;
  currentRoundWind: 'east' | 'south';
  liveRiichi?: boolean[];
  onToggleRiichi?: (playerIndex: number) => void;
}

export function ScoreBoard({ players, currentDealer, currentRoundWind, liveRiichi, onToggleRiichi }: Props) {
  const { t } = useLocale();

  return (
    <div className="grid grid-cols-2 gap-2">
      {players.map((player, idx) => {
        const isDealer = idx === currentDealer;
        const seatWind = WINDS[(idx - currentDealer + 4) % 4];
        const isRiichi = liveRiichi?.[idx] ?? false;
        const isLeftCol = idx % 2 === 0;

        return (
          <div key={player.id} className={`flex items-stretch gap-1.5 ${isLeftCol ? 'flex-row' : 'flex-row-reverse'}`}>
            {/* Riichi button — outside the card */}
            {onToggleRiichi && (
              <button
                onClick={() => onToggleRiichi(idx)}
                className={`shrink-0 w-9 rounded-lg flex items-center justify-center text-xs font-black
                  transition-all active:scale-95 writing-vertical
                  ${isRiichi
                    ? 'bg-mahjong-highlight text-white shadow-lg shadow-mahjong-highlight/30'
                    : 'bg-mahjong-card/60 text-mahjong-muted/50 border border-mahjong-accent/30 hover:text-mahjong-muted'}`}
                style={{ writingMode: 'vertical-rl' }}
              >
                {isRiichi ? '立直中' : '立直'}
              </button>
            )}

            {/* Player card */}
            <div
              className={`relative flex-1 p-3 rounded-lg min-w-0 ${
                isDealer ? 'bg-mahjong-accent ring-1 ring-mahjong-gold' : 'bg-mahjong-card'
              }`}
            >
              {/* Wind badge */}
              <span className={`absolute top-1 right-2 text-xs font-bold ${
                isDealer ? 'text-mahjong-gold' : 'text-mahjong-muted'
              }`}>
                {t(`mahjong.wind.${seatWind}`)}
              </span>

              {/* Player name + team badge */}
              <div className="flex items-center gap-1 pr-6">
                <p className="text-sm text-mahjong-muted truncate">{player.name}</p>
                {player.team && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-mahjong-green/20 text-mahjong-green font-medium shrink-0">
                    {player.team}
                  </span>
                )}
              </div>

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
          </div>
        );
      })}
    </div>
  );
}
