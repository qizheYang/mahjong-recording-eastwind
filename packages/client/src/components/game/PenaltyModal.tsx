import { useState } from 'react';
import type { GamePlayer, PenaltyInput } from '@mahjong/shared';
import { useLocale } from '../../i18n';

interface Props {
  players: GamePlayer[];
  onSubmit: (penalty: PenaltyInput) => void;
  onClose: () => void;
}

type Step = 'type' | 'player' | 'amount' | 'confirm';

export function PenaltyModal({ players, onSubmit, onClose }: Props) {
  const { t } = useLocale();
  const [step, setStep] = useState<Step>('type');
  const [penaltyType, setPenaltyType] = useState<'final_score' | 'immediate'>('immediate');
  const [playerIndex, setPlayerIndex] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  function handleSubmit() {
    if (playerIndex === null || !amount) return;
    onSubmit({
      type: penaltyType,
      playerIndex,
      amount: parseInt(amount, 10),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
  }

  const parsedAmount = parseInt(amount, 10);
  const isValidAmount = !isNaN(parsedAmount) && parsedAmount > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md bg-mahjong-bg rounded-t-2xl sm:rounded-2xl p-5 space-y-4
        max-h-[85vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{t('penalty.title')}</h2>
          <button onClick={onClose} className="text-mahjong-muted text-xl px-2">&times;</button>
        </div>

        {/* Step: Select penalty type */}
        {step === 'type' && (
          <div className="space-y-3">
            <button
              onClick={() => { setPenaltyType('immediate'); setStep('player'); }}
              className="w-full p-4 rounded-xl bg-mahjong-card text-left active:bg-mahjong-accent/20 transition-colors"
            >
              <p className="font-medium text-mahjong-highlight">{t('penalty.immediate')}</p>
              <p className="text-xs text-mahjong-muted mt-1">{t('penalty.immediateDesc')}</p>
            </button>
            <button
              onClick={() => { setPenaltyType('final_score'); setStep('player'); }}
              className="w-full p-4 rounded-xl bg-mahjong-card text-left active:bg-mahjong-accent/20 transition-colors"
            >
              <p className="font-medium text-mahjong-accent">{t('penalty.finalScore')}</p>
              <p className="text-xs text-mahjong-muted mt-1">{t('penalty.finalScoreDesc')}</p>
            </button>
          </div>
        )}

        {/* Step: Select player */}
        {step === 'player' && (
          <div className="space-y-3">
            <p className="text-sm text-mahjong-muted">{t('penalty.selectPlayer')}</p>
            <div className="grid grid-cols-2 gap-2">
              {players.map((p, i) => (
                <button
                  key={i}
                  onClick={() => { setPlayerIndex(i); setStep('amount'); }}
                  className="p-3 rounded-xl bg-mahjong-card text-center active:bg-mahjong-accent/20 transition-colors"
                >
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-mahjong-muted">{p.points.toLocaleString()}{t('mahjong.points')}</p>
                </button>
              ))}
            </div>
            <button
              onClick={() => setStep('type')}
              className="text-sm text-mahjong-muted"
            >
              {t('record.back')}
            </button>
          </div>
        )}

        {/* Step: Enter amount + reason */}
        {step === 'amount' && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-mahjong-muted mb-1">
                {players[playerIndex!]?.name} — {penaltyType === 'immediate' ? t('penalty.immediate') : t('penalty.finalScore')}
              </p>
            </div>
            <div>
              <label className="text-sm text-mahjong-muted">{t('penalty.amount')}</label>
              <div className="flex gap-2 mt-1">
                {[1000, 3000, 8000, 12000].map(val => (
                  <button
                    key={val}
                    onClick={() => setAmount(String(val))}
                    className={`flex-1 py-2 rounded-lg text-sm ${
                      amount === String(val)
                        ? 'bg-mahjong-highlight text-white'
                        : 'bg-mahjong-card text-mahjong-text'
                    }`}
                  >
                    {(val / 1000)}k
                  </button>
                ))}
              </div>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder={t('penalty.amountPlaceholder')}
                className="mt-2 w-full p-3 rounded-lg bg-mahjong-card text-mahjong-text text-center text-lg"
              />
            </div>
            <div>
              <label className="text-sm text-mahjong-muted">{t('penalty.reason')}</label>
              <input
                type="text"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={t('penalty.reasonPlaceholder')}
                className="mt-1 w-full p-3 rounded-lg bg-mahjong-card text-mahjong-text text-sm"
              />
            </div>

            {/* Preview */}
            {isValidAmount && playerIndex !== null && (
              <div className="p-3 rounded-lg bg-mahjong-card text-sm space-y-1">
                <p>
                  <span className="text-mahjong-highlight">{players[playerIndex].name}</span>
                  {' '}-{parsedAmount.toLocaleString()}{t('mahjong.points')}
                </p>
                {penaltyType === 'immediate' && (
                  <p className="text-mahjong-muted text-xs">
                    {players.filter((_, i) => i !== playerIndex).map(p => p.name).join(', ')}
                    {' '}+{Math.floor(parsedAmount / 3).toLocaleString()}{t('mahjong.points')}
                  </p>
                )}
                {penaltyType === 'final_score' && (
                  <p className="text-mahjong-muted text-xs">{t('penalty.finalScoreNote')}</p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setStep('player')}
                className="flex-1 py-3 rounded-xl bg-mahjong-card text-mahjong-muted"
              >
                {t('record.back')}
              </button>
              <button
                onClick={handleSubmit}
                disabled={!isValidAmount}
                className="flex-1 py-3 rounded-xl bg-mahjong-highlight text-white font-bold
                  disabled:opacity-30"
              >
                {t('penalty.confirm')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
