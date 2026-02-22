import type { GamePlayer } from '@mahjong/shared';
import { WINDS } from '@mahjong/shared';
import { formatPoints } from '../../lib/format';
import { useLocale } from '../../i18n';

interface Props {
  players: GamePlayer[];
  currentDealer: number;
  /** Indices to exclude from the list */
  excludeIndices?: number[];
  /** Which indices are currently selected (for toggle modes) */
  selectedIndices?: number[];
  /** Label to show on the right when selected */
  selectedLabel?: string;
  /** Label to show on the right when unselected */
  unselectedLabel?: string;
  /** Highlight color variant for selected state */
  selectedColor?: 'green' | 'gold';
  /** Whether to use dealer-highlight on unselected buttons */
  highlightDealer?: boolean;
  onClick: (index: number) => void;
  /** Optional custom right-side content per player */
  renderRight?: (index: number, selected: boolean) => React.ReactNode;
}

export function PlayerSelectGrid({
  players,
  currentDealer,
  excludeIndices = [],
  selectedIndices,
  selectedLabel,
  unselectedLabel = '—',
  selectedColor = 'green',
  highlightDealer = true,
  onClick,
  renderRight,
}: Props) {
  const { t } = useLocale();
  const seatWind = (idx: number) => WINDS[(idx - currentDealer + 4) % 4];

  const selectedBg = selectedColor === 'green' ? 'bg-mahjong-green text-mahjong-bg' : 'bg-mahjong-gold text-mahjong-bg';

  return (
    <div className="space-y-3">
      {players.map((p, idx) => {
        if (excludeIndices.includes(idx)) return null;
        const isSelected = selectedIndices?.includes(idx) ?? false;

        return (
          <button
            key={p.id}
            onClick={() => onClick(idx)}
            className={`w-full py-3 px-4 rounded-xl text-left flex items-center justify-between
              ${isSelected
                ? selectedBg
                : (highlightDealer && idx === currentDealer)
                  ? 'bg-mahjong-accent'
                  : 'bg-mahjong-card'
              }
              active:scale-[0.98] transition-transform`}
          >
            <span>
              <span className={`font-bold mr-2 ${isSelected ? 'text-mahjong-bg' : 'text-mahjong-gold'}`}>
                {t(`mahjong.wind.${seatWind(idx)}`)}
              </span>
              {p.name}
            </span>
            {renderRight ? renderRight(idx, isSelected) : (
              selectedIndices !== undefined ? (
                <span className={`text-sm font-medium ${isSelected ? '' : 'text-mahjong-muted'}`}>
                  {isSelected ? selectedLabel : unselectedLabel}
                </span>
              ) : (
                <span className="text-sm text-mahjong-muted">{formatPoints(p.points)}</span>
              )
            )}
          </button>
        );
      })}
    </div>
  );
}
