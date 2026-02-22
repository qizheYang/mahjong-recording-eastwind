import { useState, useMemo } from 'react';
import type { GamePlayer, HandResultInput, Hand, MultiRonWinnerInput } from '@mahjong/shared';
import { calculatePoints, calculateYakumanMultiplier, WINDS } from '@mahjong/shared';
import { formatPoints } from '../../lib/format';
import { useLocale } from '../../i18n';
import { HanFuSelector } from './HanFuSelector';
import { PlayerSelectGrid } from './PlayerSelectGrid';
import { YakumanSelectStep } from './YakumanSelectStep';

interface Props {
  players: GamePlayer[];
  currentDealer: number;
  honbaCount: number;
  riichiSticks: number;
  kiriageMangan?: boolean;
  doubleRonEnabled?: boolean;
  doubleYakumanEnabled?: boolean;
  multipleYakumanEnabled?: boolean;
  nagashiManganEnabled?: boolean;
  editingHand?: Hand;
  onSubmit: (result: HandResultInput) => void;
  onClose: () => void;
}

type Step = 'outcome' | 'winner' | 'method' | 'loser' | 'hanfu' | 'yakumanSelect' | 'tenpai' | 'nagashiSelect' | 'oyaTenpai' | 'riichi' | 'confirm'
  | 'multiLoser' | 'multiWinnerSelect' | 'multiHanFu' | 'multiYakumanSelect';

function getInitialState(editingHand?: Hand) {
  if (!editingHand?.input) {
    return {
      step: 'outcome' as Step,
      resultType: 'agari' as const,
      winnerIndex: null as number | null,
      isTsumo: null as boolean | null,
      loserIndex: null as number | null,
      han: 1,
      fu: 30,
      tenpaiStatus: [false, false, false, false],
      nagashiManganPlayers: [false, false, false, false],
      riichiPlayers: [false, false, false, false],
      multiRonWinners: [] as MultiRonWinnerInput[],
      multiRonLoser: null as number | null,
      selectedYakuman: [] as string[],
    };
  }
  const inp = editingHand.input;
  return {
    step: 'confirm' as Step,
    resultType: inp.resultType,
    winnerIndex: inp.winnerIndex ?? null,
    isTsumo: inp.isTsumo ?? null,
    loserIndex: inp.loserIndex ?? null,
    han: inp.han ?? 1,
    fu: inp.fu ?? 30,
    tenpaiStatus: inp.tenpaiStatus ?? [false, false, false, false],
    nagashiManganPlayers: inp.nagashiManganPlayers ?? [false, false, false, false],
    riichiPlayers: inp.riichiPlayers ?? [false, false, false, false],
    multiRonWinners: inp.multiRon?.winners ?? [],
    multiRonLoser: inp.multiRon?.loserIndex ?? null,
    selectedYakuman: inp.yakumanList ?? [],
  };
}

export function RecordHandModal({ players, currentDealer, honbaCount, riichiSticks, kiriageMangan, doubleRonEnabled, doubleYakumanEnabled, multipleYakumanEnabled, nagashiManganEnabled, editingHand, onSubmit, onClose }: Props) {
  const { t } = useLocale();
  const init = getInitialState(editingHand);
  const [step, setStep] = useState<Step>(init.step);
  const [resultType, setResultType] = useState<'agari' | 'ryuukyoku'>(init.resultType);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(init.winnerIndex);
  const [isTsumo, setIsTsumo] = useState<boolean | null>(init.isTsumo);
  const [loserIndex, setLoserIndex] = useState<number | null>(init.loserIndex);
  const [han, setHan] = useState(init.han);
  const [fu, setFu] = useState(init.fu);
  const [tenpaiStatus, setTenpaiStatus] = useState(init.tenpaiStatus);
  const [nagashiManganPlayers, setNagashiManganPlayers] = useState(init.nagashiManganPlayers);
  const [riichiPlayers, setRiichiPlayers] = useState(init.riichiPlayers);

  // Multi-ron state
  const [multiRonWinners, setMultiRonWinners] = useState<MultiRonWinnerInput[]>(init.multiRonWinners);
  const [multiRonLoser, setMultiRonLoser] = useState<number | null>(init.multiRonLoser);
  const [editingWinnerIdx, setEditingWinnerIdx] = useState(0);
  const [multiWinnerSelected, setMultiWinnerSelected] = useState<number[]>(
    init.multiRonWinners.map(w => w.winnerIndex)
  );

  // Yakuman state
  const [selectedYakuman, setSelectedYakuman] = useState<string[]>(init.selectedYakuman);

  // Calculate points preview
  const yakumanCount = selectedYakuman.length > 0
    ? calculateYakumanMultiplier(selectedYakuman, doubleYakumanEnabled ?? false, multipleYakumanEnabled ?? false)
    : undefined;

  const pointsPreview = useMemo(() => {
    if (resultType !== 'agari' || winnerIndex === null || isTsumo === null) return null;
    const isDealer = winnerIndex === currentDealer;
    return calculatePoints({ han, fu, isDealer, isTsumo, kiriageMangan, yakumanCount });
  }, [resultType, winnerIndex, isTsumo, han, fu, currentDealer, kiriageMangan, yakumanCount]);

  // Compute total with honba and riichi (including pending deposits)
  const totalWithBonuses = useMemo(() => {
    if (!pointsPreview) return 0;
    const honbaBonus = honbaCount * 300;
    const newRiichiCount = riichiPlayers.filter(Boolean).length;
    const totalRiichiSticks = riichiSticks + newRiichiCount;
    const riichiBonus = totalRiichiSticks * 1000;
    return pointsPreview.total + honbaBonus + riichiBonus;
  }, [pointsPreview, honbaCount, riichiSticks, riichiPlayers]);

  const isMultiRon = multiRonWinners.length > 0;

  function handleOutcome(type: 'agari' | 'ryuukyoku') {
    setResultType(type);
    setStep(type === 'agari' ? 'winner' : 'tenpai');
  }

  function handleSelectWinner(idx: number) {
    setWinnerIndex(idx);
    setStep('method');
  }

  function handleMethod(tsumo: boolean) {
    setIsTsumo(tsumo);
    if (tsumo) {
      setStep('hanfu');
    } else if (doubleRonEnabled) {
      setStep('multiLoser');
    } else {
      setStep('loser');
    }
  }

  function handleSelectLoser(idx: number) {
    setLoserIndex(idx);
    setStep('hanfu');
  }

  function handleMultiLoserSelect(idx: number) {
    setMultiRonLoser(idx);
    setLoserIndex(idx);
    setStep('multiWinnerSelect');
    setMultiWinnerSelected([winnerIndex!]);
  }

  function handleMultiWinnerToggle(idx: number) {
    setMultiWinnerSelected(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  }

  function handleMultiWinnerConfirm() {
    if (multiWinnerSelected.length === 1) {
      // Single winner — fall back to normal ron flow
      setLoserIndex(multiRonLoser);
      setMultiRonWinners([]);
      setMultiRonLoser(null);
      setWinnerIndex(multiWinnerSelected[0]);
      setStep('hanfu');
      return;
    }
    const winners: MultiRonWinnerInput[] = multiWinnerSelected.map(idx => ({
      winnerIndex: idx, han: 1, fu: 30,
    }));
    setMultiRonWinners(winners);
    setEditingWinnerIdx(0);
    setStep('multiHanFu');
  }

  function handleMultiHanFuNext() {
    const w = multiRonWinners[editingWinnerIdx];
    if (w && w.han >= 13) {
      // Show yakuman selection for this multi-ron winner
      setSelectedYakuman(w.yakumanList ?? []);
      setStep('multiYakumanSelect');
    } else if (editingWinnerIdx < multiRonWinners.length - 1) {
      setEditingWinnerIdx(editingWinnerIdx + 1);
    } else {
      setStep('riichi');
    }
  }

  function handleMultiYakumanConfirm(yakumanList: string[]) {
    // Store yakumanList on the current multi-ron winner
    setMultiRonWinners(prev => prev.map((w, i) =>
      i === editingWinnerIdx ? { ...w, yakumanList: yakumanList.length > 0 ? yakumanList : undefined } : w
    ));
    if (editingWinnerIdx < multiRonWinners.length - 1) {
      setEditingWinnerIdx(editingWinnerIdx + 1);
      setSelectedYakuman([]);
    } else {
      setStep('riichi');
    }
  }

  function updateMultiWinnerHanFu(newHan: number, newFu: number) {
    setMultiRonWinners(prev => prev.map((w, i) =>
      i === editingWinnerIdx ? { ...w, han: newHan, fu: newFu } : w
    ));
  }

  function handleConfirm() {
    const hasRiichi = riichiPlayers.some(Boolean);
    if (resultType === 'agari' && isMultiRon) {
      onSubmit({
        resultType: 'agari',
        multiRon: { loserIndex: multiRonLoser!, winners: multiRonWinners },
        ...(hasRiichi ? { riichiPlayers } : {}),
      });
    } else if (resultType === 'agari') {
      onSubmit({
        resultType: 'agari',
        winnerIndex: winnerIndex!,
        loserIndex: isTsumo ? undefined : loserIndex!,
        isTsumo: isTsumo!,
        han, fu,
        ...(selectedYakuman.length > 0 ? { yakumanList: selectedYakuman } : {}),
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
      case 'multiLoser': setStep('method'); break;
      case 'multiWinnerSelect': setStep('multiLoser'); break;
      case 'multiHanFu':
        if (editingWinnerIdx > 0) setEditingWinnerIdx(editingWinnerIdx - 1);
        else setStep('multiWinnerSelect');
        break;
      case 'multiYakumanSelect': setStep('multiHanFu'); break;
      case 'hanfu': setStep(isTsumo ? 'method' : (doubleRonEnabled ? 'multiLoser' : 'loser')); break;
      case 'yakumanSelect': setStep('hanfu'); break;
      case 'tenpai': setStep('outcome'); break;
      case 'nagashiSelect': setStep('tenpai'); break;
      case 'oyaTenpai': setStep('nagashiSelect'); break;
      case 'riichi':
        if (isMultiRon) {
          // Go back to last multi-ron winner's yakuman or hanfu
          const lastW = multiRonWinners[multiRonWinners.length - 1];
          if (lastW?.han >= 13) {
            setEditingWinnerIdx(multiRonWinners.length - 1);
            setStep('multiYakumanSelect');
          } else {
            setEditingWinnerIdx(multiRonWinners.length - 1);
            setStep('multiHanFu');
          }
        }
        else if (resultType === 'agari' && han >= 13) setStep('yakumanSelect');
        else if (resultType === 'agari') setStep('hanfu');
        else if (nagashiManganPlayers.some(Boolean)) {
          setStep(nagashiManganPlayers[currentDealer] ? 'oyaTenpai' : 'nagashiSelect');
        }
        else setStep('tenpai');
        break;
      case 'confirm': setStep('riichi'); break;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative w-full max-w-md bg-mahjong-bg rounded-t-2xl sm:rounded-2xl
        max-h-[85dvh] overflow-y-auto p-4 pb-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          {step !== 'outcome' ? (
            <button onClick={goBack} className="text-mahjong-muted text-sm px-2 py-1">
              {t('record.back')}
            </button>
          ) : <div />}
          <h2 className="text-lg font-bold">{editingHand ? t('record.editTitle') : t('record.title')}</h2>
          <button onClick={onClose} className="text-mahjong-muted text-sm px-2 py-1">
            {t('common.cancel')}
          </button>
        </div>

        {/* Step: Choose outcome */}
        {step === 'outcome' && (
          <div className="space-y-3">
            <p className="text-sm text-mahjong-muted text-center mb-4">{t('record.outcome')}</p>
            <button
              onClick={() => handleOutcome('agari')}
              className="w-full py-4 rounded-xl bg-mahjong-green text-mahjong-bg font-bold text-lg
                active:scale-[0.98] transition-transform"
            >
              {t('record.winAgari')}
            </button>
            <button
              onClick={() => handleOutcome('ryuukyoku')}
              className="w-full py-4 rounded-xl bg-mahjong-accent text-white font-bold text-lg
                active:scale-[0.98] transition-transform"
            >
              {t('record.drawRyuukyoku')}
            </button>
          </div>
        )}

        {/* Step: Select winner */}
        {step === 'winner' && (
          <div className="space-y-3">
            <p className="text-sm text-mahjong-muted text-center mb-4">{t('record.selectWinner')}</p>
            <PlayerSelectGrid
              players={players}
              currentDealer={currentDealer}
              onClick={handleSelectWinner}
            />
          </div>
        )}

        {/* Step: Tsumo or Ron */}
        {step === 'method' && (
          <div className="space-y-3">
            <p className="text-sm text-mahjong-muted text-center mb-2">
              {t('record.winner')}: <span className="text-white font-medium">{players[winnerIndex!]?.name}</span>
            </p>
            <p className="text-sm text-mahjong-muted text-center mb-4">{t('record.winMethod')}</p>
            <button
              onClick={() => handleMethod(true)}
              className="w-full py-4 rounded-xl bg-mahjong-gold text-mahjong-bg font-bold text-lg
                active:scale-[0.98] transition-transform"
            >
              {t('mahjong.tsumo')}
            </button>
            <button
              onClick={() => handleMethod(false)}
              className="w-full py-4 rounded-xl bg-mahjong-highlight text-white font-bold text-lg
                active:scale-[0.98] transition-transform"
            >
              {t('mahjong.ron')}
            </button>
          </div>
        )}

        {/* Step: Select loser (single Ron, no double ron) */}
        {step === 'loser' && (
          <div className="space-y-3">
            <p className="text-sm text-mahjong-muted text-center mb-4">{t('record.selectDiscarder')}</p>
            <PlayerSelectGrid
              players={players}
              currentDealer={currentDealer}
              excludeIndices={[winnerIndex!]}
              highlightDealer={false}
              onClick={handleSelectLoser}
            />
          </div>
        )}

        {/* Step: Multi-ron — Select discarder */}
        {step === 'multiLoser' && (
          <div className="space-y-3">
            <p className="text-sm text-mahjong-muted text-center mb-4">{t('record.selectDiscarder')}</p>
            <PlayerSelectGrid
              players={players}
              currentDealer={currentDealer}
              excludeIndices={[winnerIndex!]}
              highlightDealer={false}
              onClick={handleMultiLoserSelect}
            />
          </div>
        )}

        {/* Step: Multi-ron — Select winners (multi-select) */}
        {step === 'multiWinnerSelect' && (
          <div className="space-y-3">
            <p className="text-sm text-mahjong-muted text-center mb-2">
              {t('record.selectMultiWinners')}
            </p>
            <p className="text-xs text-mahjong-muted text-center mb-4">
              {t('record.discarder')}: {players[multiRonLoser!]?.name}
            </p>
            <PlayerSelectGrid
              players={players}
              currentDealer={currentDealer}
              excludeIndices={[multiRonLoser!]}
              selectedIndices={multiWinnerSelected}
              selectedLabel={t('mahjong.ron')}
              selectedColor="green"
              highlightDealer={false}
              onClick={handleMultiWinnerToggle}
            />
            <div className="bg-mahjong-card rounded-xl p-3 text-sm text-center">
              <p className="text-mahjong-muted">
                {t('record.winnerCount', { count: multiWinnerSelected.length })}
              </p>
            </div>
            <button
              onClick={handleMultiWinnerConfirm}
              disabled={multiWinnerSelected.length === 0}
              className={`w-full py-3 rounded-xl font-bold text-lg
                active:scale-[0.98] transition-transform
                ${multiWinnerSelected.length > 0
                  ? 'bg-mahjong-green text-mahjong-bg'
                  : 'bg-mahjong-card text-mahjong-muted'}`}
            >
              {t('common.next')}
            </button>
          </div>
        )}

        {/* Step: Multi-ron — Han/Fu for each winner */}
        {step === 'multiHanFu' && multiRonWinners[editingWinnerIdx] && (() => {
          const w = multiRonWinners[editingWinnerIdx];
          const isDealer = w.winnerIndex === currentDealer;
          const preview = calculatePoints({ han: w.han, fu: w.fu, isDealer, isTsumo: false, kiriageMangan });

          return (
            <div className="space-y-4">
              <p className="text-sm text-mahjong-muted text-center">
                {t('record.editWinnerHanFu', { num: editingWinnerIdx + 1, total: multiRonWinners.length })}
              </p>
              <p className="text-center text-white font-medium">
                <span className="text-mahjong-green">{players[w.winnerIndex]?.name}</span>
                {' '}<span className="text-mahjong-gold">{t('mahjong.ron')}</span>
                {' '}← {players[multiRonLoser!]?.name}
              </p>

              <HanFuSelector
                han={w.han}
                fu={w.fu}
                onHanChange={(h) => updateMultiWinnerHanFu(h, w.fu)}
                onFuChange={(f) => updateMultiWinnerHanFu(w.han, f)}
                preview={preview}
                extraInfo={
                  <p className="text-sm text-mahjong-muted mt-1">
                    {formatPoints(preview.ronPayment)}{t('mahjong.points')}
                    {honbaCount > 0 && ` + ${honbaCount * 300} honba`}
                  </p>
                }
              />

              <button
                onClick={handleMultiHanFuNext}
                className="w-full py-3 rounded-xl bg-mahjong-green text-mahjong-bg font-bold text-lg
                  active:scale-[0.98] transition-transform"
              >
                {editingWinnerIdx < multiRonWinners.length - 1
                  ? t('record.nextWinner')
                  : t('common.next')}
              </button>
            </div>
          );
        })()}

        {/* Step: Han/Fu selection (single agari) */}
        {step === 'hanfu' && (
          <div className="space-y-4">
            <p className="text-sm text-mahjong-muted text-center">
              {players[winnerIndex!]?.name}
              {' '}{isTsumo ? t('mahjong.tsumo') : t('mahjong.ron')}
              {!isTsumo && loserIndex !== null && ` ← ${players[loserIndex]?.name}`}
            </p>

            <HanFuSelector
              han={han}
              fu={fu}
              onHanChange={setHan}
              onFuChange={setFu}
              preview={pointsPreview}
              extraInfo={pointsPreview && (
                <>
                  {isTsumo ? (
                    <p className="text-sm text-mahjong-muted mt-1">
                      {winnerIndex === currentDealer
                        ? t('record.eachAll', { points: formatPoints(pointsPreview.tsumoNonDealerPayment) })
                        : t('record.tsumoSplit', { nonDealer: formatPoints(pointsPreview.tsumoNonDealerPayment), dealer: formatPoints(pointsPreview.tsumoDealerPayment) })
                      }
                    </p>
                  ) : (
                    <p className="text-sm text-mahjong-muted mt-1">
                      {t('record.fromDiscarder', { points: formatPoints(pointsPreview.ronPayment) })}
                    </p>
                  )}
                  {(honbaCount > 0 || riichiSticks > 0) && (
                    <div className="text-xs text-mahjong-muted mt-2 space-y-0.5">
                      {honbaCount > 0 && (
                        <p>{t('record.honbaBonus', { points: honbaCount * 300, count: honbaCount })}</p>
                      )}
                      {riichiSticks > 0 && (
                        <p>{t('record.riichiBonus', { points: riichiSticks * 1000, count: riichiSticks })}</p>
                      )}
                      <p className="text-mahjong-green font-medium">
                        {t('record.total', { points: formatPoints(totalWithBonuses) })}
                      </p>
                    </div>
                  )}
                </>
              )}
            />

            <button
              onClick={() => {
                if (han >= 13) {
                  setSelectedYakuman([]);
                  setStep('yakumanSelect');
                } else {
                  setStep('riichi');
                }
              }}
              className="w-full py-3 rounded-xl bg-mahjong-green text-mahjong-bg font-bold text-lg
                active:scale-[0.98] transition-transform"
            >
              {t('common.next')}
            </button>
          </div>
        )}

        {/* Step: Yakuman selection (single agari, han >= 13) */}
        {step === 'yakumanSelect' && (
          <YakumanSelectStep
            t={t}
            selectedYakuman={selectedYakuman}
            setSelectedYakuman={setSelectedYakuman}
            doubleYakumanEnabled={doubleYakumanEnabled ?? false}
            multipleYakumanEnabled={multipleYakumanEnabled ?? false}
            onConfirm={() => setStep('riichi')}
          />
        )}

        {/* Step: Yakuman selection (multi-ron per-winner, han >= 13) */}
        {step === 'multiYakumanSelect' && multiRonWinners[editingWinnerIdx] && (
          <YakumanSelectStep
            t={t}
            selectedYakuman={selectedYakuman}
            setSelectedYakuman={setSelectedYakuman}
            doubleYakumanEnabled={doubleYakumanEnabled ?? false}
            multipleYakumanEnabled={multipleYakumanEnabled ?? false}
            winnerName={players[multiRonWinners[editingWinnerIdx].winnerIndex]?.name}
            onConfirm={() => handleMultiYakumanConfirm(selectedYakuman)}
          />
        )}

        {/* Step: Tenpai selection (for draw) */}
        {step === 'tenpai' && (
          <div className="space-y-4">
            <p className="text-sm text-mahjong-muted text-center mb-4">
              {t('record.selectTenpai')}
            </p>
            <PlayerSelectGrid
              players={players}
              currentDealer={currentDealer}
              selectedIndices={tenpaiStatus.map((tp, i) => tp ? i : -1).filter(i => i >= 0)}
              selectedLabel={t('mahjong.tenpai')}
              unselectedLabel={t('mahjong.noten')}
              selectedColor="green"
              highlightDealer={false}
              onClick={(idx) => {
                const next = [...tenpaiStatus];
                next[idx] = !next[idx];
                setTenpaiStatus(next);
              }}
            />

            {/* Preview */}
            <div className="bg-mahjong-card rounded-xl p-3 text-sm">
              {(() => {
                const tCount = tenpaiStatus.filter(Boolean).length;
                const nCount = 4 - tCount;
                if (tCount === 0 || tCount === 4) return <p className="text-mahjong-muted">{t('record.noPointChanges')}</p>;
                const tReceive = 3000 / tCount;
                const nPay = 3000 / nCount;
                return (
                  <p className="text-mahjong-muted">
                    {t('record.tenpaiReceive', { points: formatPoints(tReceive), npoints: formatPoints(nPay) })}
                  </p>
                );
              })()}
            </div>

            <button
              onClick={() => { setNagashiManganPlayers([false, false, false, false]); setStep('riichi'); }}
              className="w-full py-3 rounded-xl bg-mahjong-green text-mahjong-bg font-bold text-lg
                active:scale-[0.98] transition-transform"
            >
              {t('common.next')}
            </button>

            {nagashiManganEnabled !== false && (
              <button
                onClick={() => { setTenpaiStatus([false, false, false, false]); setStep('nagashiSelect'); }}
                className="w-full py-3 rounded-xl bg-mahjong-card text-mahjong-gold font-bold
                  active:scale-[0.98] transition-transform border border-mahjong-gold/30"
              >
                {t('mahjong.nagashiMangan')}
              </button>
            )}
          </div>
        )}

        {/* Step: Select nagashi mangan players */}
        {step === 'nagashiSelect' && (
          <div className="space-y-3">
            <p className="text-sm text-mahjong-muted text-center mb-4">
              {t('record.selectNagashi')}
            </p>
            <PlayerSelectGrid
              players={players}
              currentDealer={currentDealer}
              selectedIndices={nagashiManganPlayers.map((n, i) => n ? i : -1).filter(i => i >= 0)}
              selectedColor="gold"
              highlightDealer={false}
              onClick={(idx) => {
                const next = [...nagashiManganPlayers];
                next[idx] = !next[idx];
                setNagashiManganPlayers(next);
              }}
              renderRight={(idx, selected) => {
                const isDealer = idx === currentDealer;
                const total = isDealer ? 12000 : 8000;
                return (
                  <span className={`text-sm ${selected ? '' : 'text-mahjong-muted'}`}>
                    {selected ? t('record.nagashiPoints', { points: formatPoints(total) }) : formatPoints(players[idx].points)}
                  </span>
                );
              }}
            />

            <button
              onClick={() => setStep(nagashiManganPlayers[currentDealer] ? 'oyaTenpai' : 'riichi')}
              disabled={!nagashiManganPlayers.some(Boolean)}
              className={`w-full py-3 rounded-xl font-bold text-lg
                active:scale-[0.98] transition-transform
                ${nagashiManganPlayers.some(Boolean)
                  ? 'bg-mahjong-green text-mahjong-bg'
                  : 'bg-mahjong-card text-mahjong-muted'}`}
            >
              {t('common.next')}
            </button>
          </div>
        )}

        {/* Step: Ask if dealer is tenpai (dealer has nagashi mangan) */}
        {step === 'oyaTenpai' && (
          <div className="space-y-4">
            <p className="text-sm text-mahjong-muted text-center mb-2">
              {t('record.dealerTenpai')}
            </p>

            <div className="bg-mahjong-card rounded-xl p-3 text-sm">
              <p className="text-mahjong-gold font-medium mb-1">{t('record.nagashiContext')}</p>
              {nagashiManganPlayers.map((n, i) => n ? (
                <p key={i} className="text-mahjong-gold">
                  {t(`mahjong.wind.${WINDS[(i - currentDealer + 4) % 4]}`)} {players[i]?.name} +{formatPoints(i === currentDealer ? 12000 : 8000)}{t('mahjong.points')}
                </p>
              ) : null)}
            </div>

            <p className="text-center text-white font-medium">
              <span className="text-mahjong-gold">{t(`mahjong.wind.${WINDS[0]}`)}</span>
              {' '}{players[currentDealer]?.name}
            </p>
            <p className="text-xs text-mahjong-muted text-center">
              {t('record.dealerTenpaiHint')}
            </p>

            <button
              onClick={() => {
                const next = [false, false, false, false];
                next[currentDealer] = true;
                setTenpaiStatus(next);
                setStep('riichi');
              }}
              className="w-full py-4 rounded-xl bg-mahjong-green text-mahjong-bg font-bold text-lg
                active:scale-[0.98] transition-transform"
            >
              {t('record.tenpaiRenchan')}
            </button>
            <button
              onClick={() => {
                setTenpaiStatus([false, false, false, false]);
                setStep('riichi');
              }}
              className="w-full py-4 rounded-xl bg-mahjong-card text-white font-bold text-lg
                active:scale-[0.98] transition-transform"
            >
              {t('record.notenRotate')}
            </button>
          </div>
        )}

        {/* Step: Riichi declaration */}
        {step === 'riichi' && (
          <div className="space-y-4">
            <p className="text-sm text-mahjong-muted text-center mb-4">
              {t('record.selectRiichi')}
            </p>
            <PlayerSelectGrid
              players={players}
              currentDealer={currentDealer}
              selectedIndices={riichiPlayers.map((r, i) => r ? i : -1).filter(i => i >= 0)}
              selectedLabel={t('mahjong.riichi')}
              selectedColor="gold"
              highlightDealer={false}
              onClick={(idx) => {
                const next = [...riichiPlayers];
                next[idx] = !next[idx];
                setRiichiPlayers(next);
              }}
            />

            {riichiPlayers.some(Boolean) && (
              <div className="bg-mahjong-card rounded-xl p-3 text-sm">
                <p className="text-mahjong-muted">
                  {t('record.riichiDeposit', { count: riichiPlayers.filter(Boolean).length })}
                </p>
              </div>
            )}

            <button
              onClick={() => setStep('confirm')}
              className="w-full py-3 rounded-xl bg-mahjong-green text-mahjong-bg font-bold text-lg
                active:scale-[0.98] transition-transform"
            >
              {riichiPlayers.some(Boolean) ? t('common.confirm') : t('record.noRiichi')}
            </button>
          </div>
        )}

        {/* Step: Final confirmation */}
        {step === 'confirm' && (
          <div className="space-y-4">
            <p className="text-sm text-mahjong-muted text-center mb-2">{t('record.confirmRecord')}</p>

            <div className="bg-mahjong-card rounded-xl p-4 space-y-2">
              {resultType === 'agari' && isMultiRon ? (
                <>
                  <p className="font-medium text-mahjong-gold">{t('record.multiRon')}</p>
                  <p className="text-sm text-mahjong-muted">
                    {t('record.discarder')}: {players[multiRonLoser!]?.name}
                  </p>
                  {multiRonWinners.map((w, i) => {
                    const isDealer = w.winnerIndex === currentDealer;
                    const wYakumanCount = w.yakumanList?.length
                      ? calculateYakumanMultiplier(w.yakumanList, doubleYakumanEnabled ?? false)
                      : undefined;
                    const preview = calculatePoints({ han: w.han, fu: w.fu, isDealer, isTsumo: false, kiriageMangan, yakumanCount: wYakumanCount });
                    return (
                      <div key={i} className="border-t border-mahjong-bg pt-2 mt-2">
                        <p className="text-sm">
                          <span className="text-mahjong-green font-medium">{players[w.winnerIndex]?.name}</span>
                          {' '}{w.han}han {w.han < 5 ? `${w.fu}fu` : ''}
                          {w.yakumanList?.length ? (
                            <span className="text-mahjong-gold ml-1">
                              ({w.yakumanList.map(id => t(`yakuman.${id}` as any)).join(', ')})
                            </span>
                          ) : null}
                          {preview.limitName && (
                            <span className="text-mahjong-gold ml-1">{t(`mahjong.limit.${preview.limitName}`)}</span>
                          )}
                        </p>
                        <p className="text-sm font-bold">{formatPoints(preview.ronPayment + honbaCount * 300)}{t('mahjong.points')}</p>
                      </div>
                    );
                  })}
                </>
              ) : resultType === 'agari' ? (
                <>
                  <p className="font-medium">
                    <span className="text-mahjong-green">{players[winnerIndex!]?.name}</span>
                    {' '}
                    <span className="text-mahjong-gold">{isTsumo ? t('mahjong.tsumo') : t('mahjong.ron')}</span>
                  </p>
                  {!isTsumo && loserIndex !== null && (
                    <p className="text-sm text-mahjong-muted">
                      {t('record.discarder')}: {players[loserIndex]?.name}
                    </p>
                  )}
                  <p className="text-sm">
                    {han}han {han < 5 ? `${fu}fu` : ''}
                    {selectedYakuman.length > 0 && (
                      <span className="text-mahjong-gold ml-1">
                        ({selectedYakuman.map(id => t(`yakuman.${id}` as any)).join(', ')})
                      </span>
                    )}
                  </p>
                  {pointsPreview?.limitName && (
                    <p className="text-mahjong-gold font-bold">{t(`mahjong.limit.${pointsPreview.limitName}`)}</p>
                  )}
                  <p className="text-lg font-bold">{formatPoints(totalWithBonuses)}{t('mahjong.points')}</p>
                </>
              ) : (
                <>
                  <p className="font-medium">
                    {nagashiManganPlayers.some(Boolean) ? t('mahjong.nagashiMangan') : t('mahjong.draw')}
                  </p>
                  {nagashiManganPlayers.some(Boolean) && (
                    <div className="text-sm text-mahjong-gold font-bold">
                      {nagashiManganPlayers.map((n, i) => n ? (
                        <p key={i}>{players[i]?.name} +{formatPoints(i === currentDealer ? 12000 : 8000)}{t('mahjong.points')}</p>
                      ) : null)}
                    </div>
                  )}
                  <p className="text-sm text-mahjong-muted">
                    {t('mahjong.tenpai')}: {tenpaiStatus.map((tp, i) => tp ? players[i]?.name : null).filter(Boolean).join(', ') || t('common.none')}
                  </p>
                </>
              )}

              {riichiPlayers.some(Boolean) && (
                <p className="text-sm text-mahjong-gold">
                  {t('record.riichiPoints', { names: riichiPlayers.map((r, i) => r ? players[i]?.name : null).filter(Boolean).join(', '), points: riichiPlayers.filter(Boolean).length * 1000 })}
                </p>
              )}
            </div>

            <button
              onClick={handleConfirm}
              className="w-full py-4 rounded-xl bg-mahjong-highlight text-white font-bold text-lg
                active:scale-[0.98] transition-transform"
            >
              {t('common.submit')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
