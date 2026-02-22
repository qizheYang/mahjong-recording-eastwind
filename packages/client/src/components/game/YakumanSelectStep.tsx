import { YAKUMAN_LIST, calculateYakumanMultiplier } from '@mahjong/shared';

interface Props {
  t: (key: string, params?: Record<string, any>) => string;
  selectedYakuman: string[];
  setSelectedYakuman: (yakuman: string[]) => void;
  doubleYakumanEnabled: boolean;
  winnerName?: string;
  onConfirm: () => void;
}

export function YakumanSelectStep({ t, selectedYakuman, setSelectedYakuman, doubleYakumanEnabled, winnerName, onConfirm }: Props) {
  const multiplier = selectedYakuman.length > 0
    ? calculateYakumanMultiplier(selectedYakuman, doubleYakumanEnabled)
    : 1;

  function toggleYakuman(id: string) {
    setSelectedYakuman(
      selectedYakuman.includes(id)
        ? selectedYakuman.filter(y => y !== id)
        : [...selectedYakuman, id]
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-mahjong-muted text-center">
        {t('record.selectYakuman')}
      </p>
      {winnerName && (
        <p className="text-center text-white font-medium">
          <span className="text-mahjong-green">{winnerName}</span>
        </p>
      )}

      <div className="space-y-2 max-h-[50vh] overflow-y-auto">
        {YAKUMAN_LIST.map(y => {
          const selected = selectedYakuman.includes(y.id);
          const isDouble = y.isDouble && doubleYakumanEnabled;
          return (
            <button
              key={y.id}
              onClick={() => toggleYakuman(y.id)}
              className={`w-full py-2.5 px-4 rounded-xl text-left flex items-center justify-between
                ${selected ? 'bg-mahjong-gold text-mahjong-bg' : 'bg-mahjong-card'}
                active:scale-[0.98] transition-transform`}
            >
              <span className="flex items-center gap-2">
                <span className={selected ? 'font-bold' : ''}>{t(`yakuman.${y.id}`)}</span>
                {isDouble && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${selected ? 'bg-mahjong-bg/20' : 'bg-mahjong-highlight/30 text-mahjong-highlight'}`}>
                    {t('yakuman.doubleMarker')}
                  </span>
                )}
              </span>
              <span className={`text-sm ${selected ? '' : 'text-mahjong-muted'}`}>
                {selected ? (isDouble ? '×2' : '×1') : '—'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Multiplier preview */}
      {selectedYakuman.length > 0 && (
        <div className="bg-mahjong-card rounded-xl p-3 text-center">
          <p className="text-mahjong-gold font-bold text-lg">
            {t('record.yakumanMultiplier', { count: multiplier })}
          </p>
        </div>
      )}

      <button
        onClick={onConfirm}
        className="w-full py-3 rounded-xl bg-mahjong-green text-mahjong-bg font-bold text-lg
          active:scale-[0.98] transition-transform"
      >
        {selectedYakuman.length > 0 ? t('common.next') : t('record.skipYakuman')}
      </button>
    </div>
  );
}
