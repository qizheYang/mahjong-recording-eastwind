import type { PointCalcResult } from '@mahjong/shared';
import { formatPoints } from '../../lib/format';
import { useLocale } from '../../i18n';

const FU_OPTIONS = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110];

interface Props {
  han: number;
  fu: number;
  onHanChange: (han: number) => void;
  onFuChange: (fu: number) => void;
  preview: PointCalcResult | null;
  /** Extra info lines below the main points display */
  extraInfo?: React.ReactNode;
  /** Callback when user clicks "Yakuman" button (go to yakuman selection) */
  onYakuman?: () => void;
  /** Whether counted yakuman (kazoe) is enabled in the ruleset */
  countedYakumanEnabled?: boolean;
  /** Whether currently in kazoe yakuman mode */
  isKazoeMode?: boolean;
  /** Toggle kazoe yakuman mode */
  onKazoeToggle?: () => void;
}

export function HanFuSelector({ han, fu, onHanChange, onFuChange, preview, extraInfo, onYakuman, countedYakumanEnabled, isKazoeMode, onKazoeToggle }: Props) {
  const { t } = useLocale();

  return (
    <div className="space-y-4">
      {isKazoeMode ? (
        /* Kazoe yakuman mode: number input for han */
        <div>
          <label className="block text-sm text-mahjong-muted mb-2">{t('record.kazoeYakuman')}</label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={13}
              value={han}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 13) onHanChange(v);
              }}
              className="w-20 h-10 rounded-lg bg-mahjong-card text-center text-white font-bold
                border border-mahjong-gold/30 focus:border-mahjong-gold outline-none"
            />
            <span className="text-mahjong-muted">{t('mahjong.han')}</span>
          </div>
          {onKazoeToggle && (
            <button
              onClick={onKazoeToggle}
              className="text-sm text-mahjong-muted mt-2 underline"
            >
              {t('record.back')}
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Han selector */}
          <div>
            <label className="block text-sm text-mahjong-muted mb-2">{t('record.hanLabel')}</label>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(h => (
                <button
                  key={h}
                  onClick={() => onHanChange(h)}
                  className={`w-10 h-10 rounded-lg font-bold text-sm
                    ${han === h
                      ? 'bg-mahjong-highlight text-white'
                      : 'bg-mahjong-card text-mahjong-muted'
                    } active:scale-95 transition-transform`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>

          {/* Yakuman & Kazoe buttons */}
          <div className="flex gap-2">
            {onYakuman && (
              <button
                onClick={onYakuman}
                className="flex-1 py-2.5 rounded-xl bg-mahjong-gold text-mahjong-bg font-bold
                  active:scale-[0.98] transition-transform"
              >
                {t('record.yakumanDirect')}
              </button>
            )}
            {countedYakumanEnabled && onKazoeToggle && (
              <button
                onClick={() => { onHanChange(13); onKazoeToggle(); }}
                className="flex-1 py-2.5 rounded-xl bg-mahjong-card text-mahjong-gold font-bold
                  border border-mahjong-gold/30 active:scale-[0.98] transition-transform"
              >
                {t('record.kazoeYakuman')}
              </button>
            )}
          </div>
        </>
      )}

      {/* Fu selector (only for < 5 han, not in kazoe mode) */}
      {han < 5 && !isKazoeMode && (
        <div>
          <label className="block text-sm text-mahjong-muted mb-2">{t('record.fuLabel')}</label>
          <div className="flex flex-wrap gap-2">
            {FU_OPTIONS.map(f => (
              <button
                key={f}
                onClick={() => onFuChange(f)}
                className={`px-3 h-10 rounded-lg font-bold text-sm
                  ${fu === f
                    ? 'bg-mahjong-highlight text-white'
                    : 'bg-mahjong-card text-mahjong-muted'
                  } active:scale-95 transition-transform`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Points preview */}
      {preview && (
        <div className="bg-mahjong-card rounded-xl p-4">
          <p className="text-sm text-mahjong-muted mb-1">{t('record.pointsLabel')}</p>
          {preview.limitName && (
            <p className="text-mahjong-gold font-bold text-lg mb-1">
              {t(`mahjong.limit.${preview.limitName}`)}
            </p>
          )}
          <p className="text-xl font-bold">
            {formatPoints(preview.total)}{t('mahjong.points')}
          </p>
          {extraInfo}
        </div>
      )}
    </div>
  );
}
