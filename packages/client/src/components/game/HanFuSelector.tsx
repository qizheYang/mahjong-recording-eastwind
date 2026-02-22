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
}

export function HanFuSelector({ han, fu, onHanChange, onFuChange, preview, extraInfo }: Props) {
  const { t } = useLocale();

  return (
    <div className="space-y-4">
      {/* Han selector */}
      <div>
        <label className="block text-sm text-mahjong-muted mb-2">{t('record.hanLabel')}</label>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(h => (
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

      {/* Fu selector (only for < 5 han) */}
      {han < 5 && (
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
