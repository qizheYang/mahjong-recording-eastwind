import { useState, useMemo } from 'react';
import type { GamePlayer, HandResultInput } from '@mahjong/shared';
import { calculatePoints, WINDS, WIND_LABELS } from '@mahjong/shared';
import { formatPoints } from '../../lib/format';

interface Props {
  players: GamePlayer[];
  currentDealer: number;
  honbaCount: number;
  riichiSticks: number;
  onSubmit: (result: HandResultInput) => void;
  onClose: () => void;
}

type Step = 'outcome' | 'winner' | 'method' | 'loser' | 'hanfu' | 'tenpai' | 'nagashiSelect' | 'riichi' | 'confirm';

export function RecordHandModal({ players, currentDealer, honbaCount, riichiSticks, onSubmit, onClose }: Props) {
  const [step, setStep] = useState<Step>('outcome');
  const [resultType, setResultType] = useState<'agari' | 'ryuukyoku'>('agari');
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  const [isTsumo, setIsTsumo] = useState<boolean | null>(null);
  const [loserIndex, setLoserIndex] = useState<number | null>(null);
  const [han, setHan] = useState(1);
  const [fu, setFu] = useState(30);
  const [tenpaiStatus, setTenpaiStatus] = useState([false, false, false, false]);
  const [nagashiManganPlayers, setNagashiManganPlayers] = useState([false, false, false, false]);
  const [riichiPlayers, setRiichiPlayers] = useState([false, false, false, false]);

  // Calculate points preview
  const pointsPreview = useMemo(() => {
    if (resultType !== 'agari' || winnerIndex === null || isTsumo === null) return null;
    const isDealer = winnerIndex === currentDealer;
    return calculatePoints({ han, fu, isDealer, isTsumo });
  }, [resultType, winnerIndex, isTsumo, han, fu, currentDealer]);

  // Compute total with honba and riichi (including pending deposits)
  const totalWithBonuses = useMemo(() => {
    if (!pointsPreview) return 0;
    const honbaBonus = honbaCount * (isTsumo ? 300 : 300);
    const newRiichiCount = riichiPlayers.filter(Boolean).length;
    const totalRiichiSticks = riichiSticks + newRiichiCount;
    const riichiBonus = totalRiichiSticks * 1000;
    return pointsPreview.total + honbaBonus + riichiBonus;
  }, [pointsPreview, honbaCount, riichiSticks, riichiPlayers, isTsumo]);

  function handleOutcome(type: 'agari' | 'ryuukyoku') {
    setResultType(type);
    if (type === 'agari') {
      setStep('winner');
    } else {
      setStep('tenpai');
    }
  }

  function handleSelectWinner(idx: number) {
    setWinnerIndex(idx);
    setStep('method');
  }

  function handleMethod(tsumo: boolean) {
    setIsTsumo(tsumo);
    if (tsumo) {
      setStep('hanfu');
    } else {
      setStep('loser');
    }
  }

  function handleSelectLoser(idx: number) {
    setLoserIndex(idx);
    setStep('hanfu');
  }

  function handleConfirm() {
    const hasRiichi = riichiPlayers.some(Boolean);
    if (resultType === 'agari') {
      onSubmit({
        resultType: 'agari',
        winnerIndex: winnerIndex!,
        loserIndex: isTsumo ? undefined : loserIndex!,
        isTsumo: isTsumo!,
        han,
        fu,
        ...(hasRiichi ? { riichiPlayers } : {}),
      });
    } else {
      onSubmit({
        resultType: 'ryuukyoku',
        tenpaiStatus,
        ...(nagashiManganPlayers.some(Boolean) ? { nagashiManganPlayers } : {}),
        ...(hasRiichi ? { riichiPlayers } : {}),
      });
    }
  }

  function goBack() {
    switch (step) {
      case 'winner': setStep('outcome'); break;
      case 'method': setStep('winner'); break;
      case 'loser': setStep('method'); break;
      case 'hanfu': setStep(isTsumo ? 'method' : 'loser'); break;
      case 'tenpai': setStep('outcome'); break;
      case 'nagashiSelect': setStep('tenpai'); break;
      case 'riichi':
        if (resultType === 'agari') setStep('hanfu');
        else if (nagashiManganPlayers.some(Boolean)) setStep('nagashiSelect');
        else setStep('tenpai');
        break;
      case 'confirm': setStep('riichi'); break;
    }
  }

  const seatWind = (idx: number) => WINDS[(idx - currentDealer + 4) % 4];

  const FU_OPTIONS = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-mahjong-bg rounded-t-2xl sm:rounded-2xl
        max-h-[85dvh] overflow-y-auto p-4 pb-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          {step !== 'outcome' ? (
            <button onClick={goBack} className="text-mahjong-muted text-sm px-2 py-1">
              ← 返回
            </button>
          ) : (
            <div />
          )}
          <h2 className="text-lg font-bold">记录本局 Record Hand</h2>
          <button onClick={onClose} className="text-mahjong-muted text-sm px-2 py-1">
            取消
          </button>
        </div>

        {/* Step: Choose outcome */}
        {step === 'outcome' && (
          <div className="space-y-3">
            <p className="text-sm text-mahjong-muted text-center mb-4">本局结果 Outcome</p>
            <button
              onClick={() => handleOutcome('agari')}
              className="w-full py-4 rounded-xl bg-mahjong-green text-mahjong-bg font-bold text-lg
                active:scale-[0.98] transition-transform"
            >
              和牌 Win (Agari)
            </button>
            <button
              onClick={() => handleOutcome('ryuukyoku')}
              className="w-full py-4 rounded-xl bg-mahjong-accent text-white font-bold text-lg
                active:scale-[0.98] transition-transform"
            >
              流局 Draw (Ryuukyoku)
            </button>
          </div>
        )}

        {/* Step: Select winner */}
        {step === 'winner' && (
          <div className="space-y-3">
            <p className="text-sm text-mahjong-muted text-center mb-4">选择和牌者 Select Winner</p>
            {players.map((p, idx) => (
              <button
                key={p.id}
                onClick={() => handleSelectWinner(idx)}
                className={`w-full py-3 px-4 rounded-xl text-left flex items-center justify-between
                  ${idx === currentDealer ? 'bg-mahjong-accent' : 'bg-mahjong-card'}
                  active:scale-[0.98] transition-transform`}
              >
                <span>
                  <span className="text-mahjong-gold font-bold mr-2">
                    {WIND_LABELS[seatWind(idx)]}
                  </span>
                  {p.name}
                </span>
                <span className="text-sm text-mahjong-muted">{formatPoints(p.points)}</span>
              </button>
            ))}
          </div>
        )}

        {/* Step: Tsumo or Ron */}
        {step === 'method' && (
          <div className="space-y-3">
            <p className="text-sm text-mahjong-muted text-center mb-2">
              和牌者: <span className="text-white font-medium">{players[winnerIndex!]?.name}</span>
            </p>
            <p className="text-sm text-mahjong-muted text-center mb-4">和牌方式 Win Method</p>
            <button
              onClick={() => handleMethod(true)}
              className="w-full py-4 rounded-xl bg-mahjong-gold text-mahjong-bg font-bold text-lg
                active:scale-[0.98] transition-transform"
            >
              自摸 Tsumo
            </button>
            <button
              onClick={() => handleMethod(false)}
              className="w-full py-4 rounded-xl bg-mahjong-highlight text-white font-bold text-lg
                active:scale-[0.98] transition-transform"
            >
              荣和 Ron
            </button>
          </div>
        )}

        {/* Step: Select loser (for Ron) */}
        {step === 'loser' && (
          <div className="space-y-3">
            <p className="text-sm text-mahjong-muted text-center mb-4">选择放铳者 Select Discarder</p>
            {players.map((p, idx) => {
              if (idx === winnerIndex) return null;
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelectLoser(idx)}
                  className={`w-full py-3 px-4 rounded-xl text-left flex items-center justify-between
                    bg-mahjong-card active:scale-[0.98] transition-transform`}
                >
                  <span>
                    <span className="text-mahjong-gold font-bold mr-2">
                      {WIND_LABELS[seatWind(idx)]}
                    </span>
                    {p.name}
                  </span>
                  <span className="text-sm text-mahjong-muted">{formatPoints(p.points)}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Step: Han/Fu selection */}
        {step === 'hanfu' && (
          <div className="space-y-4">
            <p className="text-sm text-mahjong-muted text-center">
              {players[winnerIndex!]?.name}
              {' '}{isTsumo ? '自摸 Tsumo' : '荣和 Ron'}
              {!isTsumo && loserIndex !== null && ` ← ${players[loserIndex]?.name}`}
            </p>

            {/* Han selector */}
            <div>
              <label className="block text-sm text-mahjong-muted mb-2">番数 Han</label>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(h => (
                  <button
                    key={h}
                    onClick={() => setHan(h)}
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
                <label className="block text-sm text-mahjong-muted mb-2">符数 Fu</label>
                <div className="flex flex-wrap gap-2">
                  {FU_OPTIONS.map(f => (
                    <button
                      key={f}
                      onClick={() => setFu(f)}
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
            {pointsPreview && (
              <div className="bg-mahjong-card rounded-xl p-4">
                <p className="text-sm text-mahjong-muted mb-1">得点 Points</p>
                {pointsPreview.limitNameCn && (
                  <p className="text-mahjong-gold font-bold text-lg mb-1">
                    {pointsPreview.limitNameCn} ({pointsPreview.limitName})
                  </p>
                )}
                <p className="text-xl font-bold">
                  {formatPoints(pointsPreview.total)}点
                </p>
                {isTsumo ? (
                  <p className="text-sm text-mahjong-muted mt-1">
                    {winnerIndex === currentDealer
                      ? `各 ${formatPoints(pointsPreview.tsumoNonDealerPayment)} all`
                      : `${formatPoints(pointsPreview.tsumoNonDealerPayment)}/${formatPoints(pointsPreview.tsumoDealerPayment)}`
                    }
                  </p>
                ) : (
                  <p className="text-sm text-mahjong-muted mt-1">
                    {formatPoints(pointsPreview.ronPayment)}点 from discarder
                  </p>
                )}
                {(honbaCount > 0 || riichiSticks > 0) && (
                  <div className="text-xs text-mahjong-muted mt-2 space-y-0.5">
                    {honbaCount > 0 && (
                      <p>+ {honbaCount * (isTsumo ? 300 : 300)}点 honba ({honbaCount}本场)</p>
                    )}
                    {riichiSticks > 0 && (
                      <p>+ {riichiSticks * 1000}点 riichi ({riichiSticks}供托)</p>
                    )}
                    <p className="text-mahjong-green font-medium">
                      合计 Total: {formatPoints(totalWithBonuses)}点
                    </p>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setStep('riichi')}
              className="w-full py-3 rounded-xl bg-mahjong-green text-mahjong-bg font-bold text-lg
                active:scale-[0.98] transition-transform"
            >
              下一步 Next
            </button>
          </div>
        )}

        {/* Step: Tenpai selection (for draw) */}
        {step === 'tenpai' && (
          <div className="space-y-4">
            <p className="text-sm text-mahjong-muted text-center mb-4">
              选择聴牌玩家 Select Tenpai Players
            </p>
            {players.map((p, idx) => (
              <button
                key={p.id}
                onClick={() => {
                  const next = [...tenpaiStatus];
                  next[idx] = !next[idx];
                  setTenpaiStatus(next);
                }}
                className={`w-full py-3 px-4 rounded-xl text-left flex items-center justify-between
                  ${tenpaiStatus[idx] ? 'bg-mahjong-green text-mahjong-bg' : 'bg-mahjong-card'}
                  active:scale-[0.98] transition-transform`}
              >
                <span>
                  <span className={`font-bold mr-2 ${tenpaiStatus[idx] ? 'text-mahjong-bg' : 'text-mahjong-gold'}`}>
                    {WIND_LABELS[seatWind(idx)]}
                  </span>
                  {p.name}
                </span>
                <span className={`text-sm font-medium ${tenpaiStatus[idx] ? '' : 'text-mahjong-muted'}`}>
                  {tenpaiStatus[idx] ? '聴牌 Tenpai' : '不聴 Noten'}
                </span>
              </button>
            ))}

            {/* Preview */}
            <div className="bg-mahjong-card rounded-xl p-3 text-sm">
              {(() => {
                const tCount = tenpaiStatus.filter(Boolean).length;
                const nCount = 4 - tCount;
                if (tCount === 0 || tCount === 4) return <p className="text-mahjong-muted">得点移動なし No point changes</p>;
                const tReceive = 3000 / tCount;
                const nPay = 3000 / nCount;
                return (
                  <p className="text-mahjong-muted">
                    聴牌 +{formatPoints(tReceive)} each / 不聴 -{formatPoints(nPay)} each
                  </p>
                );
              })()}
            </div>

            <button
              onClick={() => { setNagashiManganPlayers([false, false, false, false]); setStep('riichi'); }}
              className="w-full py-3 rounded-xl bg-mahjong-green text-mahjong-bg font-bold text-lg
                active:scale-[0.98] transition-transform"
            >
              下一步 Next
            </button>

            <button
              onClick={() => setStep('nagashiSelect')}
              className="w-full py-3 rounded-xl bg-mahjong-card text-mahjong-gold font-bold
                active:scale-[0.98] transition-transform border border-mahjong-gold/30"
            >
              流局满贯 Nagashi Mangan
            </button>
          </div>
        )}

        {/* Step: Select nagashi mangan players (multi-select) */}
        {step === 'nagashiSelect' && (
          <div className="space-y-3">
            <p className="text-sm text-mahjong-muted text-center mb-4">
              选择流局满贯玩家 Select Nagashi Mangan Players
            </p>
            {players.map((p, idx) => {
              const isDealer = idx === currentDealer;
              const total = isDealer ? 12000 : 8000;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    const next = [...nagashiManganPlayers];
                    next[idx] = !next[idx];
                    setNagashiManganPlayers(next);
                  }}
                  className={`w-full py-3 px-4 rounded-xl text-left flex items-center justify-between
                    ${nagashiManganPlayers[idx] ? 'bg-mahjong-gold text-mahjong-bg' : 'bg-mahjong-card'}
                    active:scale-[0.98] transition-transform`}
                >
                  <span>
                    <span className={`font-bold mr-2 ${nagashiManganPlayers[idx] ? 'text-mahjong-bg' : 'text-mahjong-gold'}`}>
                      {WIND_LABELS[seatWind(idx)]}
                    </span>
                    {p.name}
                  </span>
                  <span className={`text-sm ${nagashiManganPlayers[idx] ? '' : 'text-mahjong-muted'}`}>
                    {nagashiManganPlayers[idx] ? `流局满贯 +${formatPoints(total)}点` : formatPoints(p.points)}
                  </span>
                </button>
              );
            })}

            <button
              onClick={() => setStep('riichi')}
              disabled={!nagashiManganPlayers.some(Boolean)}
              className={`w-full py-3 rounded-xl font-bold text-lg
                active:scale-[0.98] transition-transform
                ${nagashiManganPlayers.some(Boolean)
                  ? 'bg-mahjong-green text-mahjong-bg'
                  : 'bg-mahjong-card text-mahjong-muted'}`}
            >
              下一步 Next
            </button>
          </div>
        )}

        {/* Step: Riichi declaration */}
        {step === 'riichi' && (
          <div className="space-y-4">
            <p className="text-sm text-mahjong-muted text-center mb-4">
              选择立直玩家 Select Riichi Players
            </p>
            {players.map((p, idx) => (
              <button
                key={p.id}
                onClick={() => {
                  const next = [...riichiPlayers];
                  next[idx] = !next[idx];
                  setRiichiPlayers(next);
                }}
                className={`w-full py-3 px-4 rounded-xl text-left flex items-center justify-between
                  ${riichiPlayers[idx] ? 'bg-mahjong-gold text-mahjong-bg' : 'bg-mahjong-card'}
                  active:scale-[0.98] transition-transform`}
              >
                <span>
                  <span className={`font-bold mr-2 ${riichiPlayers[idx] ? 'text-mahjong-bg' : 'text-mahjong-gold'}`}>
                    {WIND_LABELS[seatWind(idx)]}
                  </span>
                  {p.name}
                </span>
                <span className={`text-sm font-medium ${riichiPlayers[idx] ? '' : 'text-mahjong-muted'}`}>
                  {riichiPlayers[idx] ? '立直 Riichi' : '—'}
                </span>
              </button>
            ))}

            {riichiPlayers.some(Boolean) && (
              <div className="bg-mahjong-card rounded-xl p-3 text-sm">
                <p className="text-mahjong-muted">
                  立直供托: {riichiPlayers.filter(Boolean).length} x 1,000点
                </p>
              </div>
            )}

            <button
              onClick={() => setStep('confirm')}
              className="w-full py-3 rounded-xl bg-mahjong-green text-mahjong-bg font-bold text-lg
                active:scale-[0.98] transition-transform"
            >
              {riichiPlayers.some(Boolean) ? '确认 Confirm' : '无立直 No Riichi'}
            </button>
          </div>
        )}

        {/* Step: Final confirmation */}
        {step === 'confirm' && (
          <div className="space-y-4">
            <p className="text-sm text-mahjong-muted text-center mb-2">确认记录 Confirm Record</p>

            <div className="bg-mahjong-card rounded-xl p-4 space-y-2">
              {resultType === 'agari' ? (
                <>
                  <p className="font-medium">
                    <span className="text-mahjong-green">{players[winnerIndex!]?.name}</span>
                    {' '}
                    <span className="text-mahjong-gold">{isTsumo ? '自摸 Tsumo' : '荣和 Ron'}</span>
                  </p>
                  {!isTsumo && loserIndex !== null && (
                    <p className="text-sm text-mahjong-muted">
                      放铳: {players[loserIndex]?.name}
                    </p>
                  )}
                  <p className="text-sm">{han}han {han < 5 ? `${fu}fu` : ''}</p>
                  {pointsPreview?.limitNameCn && (
                    <p className="text-mahjong-gold font-bold">{pointsPreview.limitNameCn}</p>
                  )}
                  <p className="text-lg font-bold">{formatPoints(totalWithBonuses)}点</p>
                </>
              ) : (
                <>
                  <p className="font-medium">
                    {nagashiManganPlayers.some(Boolean) ? '流局满贯 Nagashi Mangan' : '流局 Draw'}
                  </p>
                  {nagashiManganPlayers.some(Boolean) && (
                    <div className="text-sm text-mahjong-gold font-bold">
                      {nagashiManganPlayers.map((n, i) => n ? (
                        <p key={i}>{players[i]?.name} +{formatPoints(i === currentDealer ? 12000 : 8000)}点</p>
                      ) : null)}
                    </div>
                  )}
                  <p className="text-sm text-mahjong-muted">
                    聴牌: {tenpaiStatus.map((t, i) => t ? players[i]?.name : null).filter(Boolean).join(', ') || '无 None'}
                  </p>
                </>
              )}

              {riichiPlayers.some(Boolean) && (
                <p className="text-sm text-mahjong-gold">
                  立直: {riichiPlayers.map((r, i) => r ? players[i]?.name : null).filter(Boolean).join(', ')}
                  {' '}(-{riichiPlayers.filter(Boolean).length * 1000}点)
                </p>
              )}
            </div>

            <button
              onClick={handleConfirm}
              className="w-full py-4 rounded-xl bg-mahjong-highlight text-white font-bold text-lg
                active:scale-[0.98] transition-transform"
            >
              提交 Submit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
