import type { HandResult, AgariResult, MultiAgariResult, RyuukyokuResult } from '../types/game.js';
import { calculatePoints } from './calculator.js';

export interface TransferResult {
  /** Point deltas for each player [p0, p1, p2, p3] */
  deltas: number[];
  /** Description of the transfer for display */
  description: string;
}

/**
 * Calculate point transfers for a hand result.
 * Returns the delta (change) for each player's score.
 */
export function calculateTransfers(
  result: HandResult,
  dealerIndex: number,
  honbaCount: number,
  riichiSticksOnTable: number,
  kiriageMangan?: boolean,
): TransferResult {
  if (result.type === 'agari') {
    return calculateAgariTransfers(result, dealerIndex, honbaCount, riichiSticksOnTable, kiriageMangan);
  } else if (result.type === 'multi_agari') {
    return calculateMultiAgariTransfers(result, dealerIndex, honbaCount, riichiSticksOnTable, kiriageMangan);
  } else {
    return calculateRyuukyokuTransfers(result, dealerIndex);
  }
}

function calculateAgariTransfers(
  result: AgariResult,
  dealerIndex: number,
  honbaCount: number,
  riichiSticksOnTable: number,
  kiriageMangan?: boolean,
): TransferResult {
  const deltas = [0, 0, 0, 0];
  const { winnerIndex, loserIndex, isTsumo, han, fu } = result;
  const isDealer = winnerIndex === dealerIndex;

  const calc = calculatePoints({ han, fu, isDealer, isTsumo, kiriageMangan, yakumanCount: result.yakumanCount });

  if (isTsumo) {
    for (let i = 0; i < 4; i++) {
      if (i === winnerIndex) continue;

      let payment: number;
      if (isDealer) {
        // Dealer tsumo: each non-dealer pays equally
        payment = calc.tsumoNonDealerPayment;
      } else {
        // Non-dealer tsumo: dealer pays more
        payment = i === dealerIndex
          ? calc.tsumoDealerPayment
          : calc.tsumoNonDealerPayment;
      }

      // Honba bonus: +100 per honba per player for tsumo
      payment += honbaCount * 100;

      deltas[i] -= payment;
      deltas[winnerIndex] += payment;
    }
  } else {
    // Ron: discarder pays full amount
    let payment = calc.ronPayment;
    // Honba bonus: +300 per honba for ron
    payment += honbaCount * 300;

    deltas[loserIndex!] -= payment;
    deltas[winnerIndex] += payment;
  }

  // Winner collects riichi sticks on table
  const riichiBonus = riichiSticksOnTable * 1000;
  deltas[winnerIndex] += riichiBonus;

  // Build description
  const limitStr = calc.limitNameCn
    ? ` (${calc.limitNameCn})`
    : '';
  const honbaStr = honbaCount > 0
    ? ` +${honbaCount * (isTsumo ? 300 : 300)} honba`
    : '';
  const riichiStr = riichiBonus > 0
    ? ` +${riichiBonus} riichi`
    : '';
  const description = isTsumo
    ? `Tsumo ${han}han/${fu}fu${limitStr}: ${calc.total}点${honbaStr}${riichiStr}`
    : `Ron ${han}han/${fu}fu${limitStr}: ${calc.ronPayment}点${honbaStr}${riichiStr}`;

  return { deltas, description };
}

/**
 * Get the closest winner to the loser in turn order (shimocha first).
 * Used to determine who collects riichi sticks in multi-ron.
 */
function getClosestWinner(loserIndex: number, winnerIndices: number[]): number {
  for (let offset = 1; offset <= 3; offset++) {
    const candidate = (loserIndex + offset) % 4;
    if (winnerIndices.includes(candidate)) return candidate;
  }
  return winnerIndices[0]; // fallback
}

function calculateMultiAgariTransfers(
  result: MultiAgariResult,
  dealerIndex: number,
  honbaCount: number,
  riichiSticksOnTable: number,
  kiriageMangan?: boolean,
): TransferResult {
  const deltas = [0, 0, 0, 0];
  const { loserIndex, winners } = result;

  // Each winner gets their ron payment + honba bonus from the discarder
  for (const w of winners) {
    const isDealer = w.winnerIndex === dealerIndex;
    const calc = calculatePoints({ han: w.han, fu: w.fu, isDealer, isTsumo: false, kiriageMangan, yakumanCount: w.yakumanCount });

    let payment = calc.ronPayment;
    payment += honbaCount * 300; // each winner gets honba bonus

    deltas[loserIndex] -= payment;
    deltas[w.winnerIndex] += payment;
  }

  // Riichi sticks go to the closest winner in turn order
  if (riichiSticksOnTable > 0) {
    const winnerIndices = winners.map(w => w.winnerIndex);
    const closestWinner = getClosestWinner(loserIndex, winnerIndices);
    deltas[closestWinner] += riichiSticksOnTable * 1000;
  }

  // Build description
  const parts = winners.map(w => {
    const isDealer = w.winnerIndex === dealerIndex;
    const calc = calculatePoints({ han: w.han, fu: w.fu, isDealer, isTsumo: false, kiriageMangan, yakumanCount: w.yakumanCount });
    const limitStr = calc.limitNameCn ? ` (${calc.limitNameCn})` : '';
    return `P${w.winnerIndex + 1}: ${w.han}han/${w.fu}fu${limitStr} ${calc.ronPayment}点`;
  });
  const description = `Multi-ron: ${parts.join(', ')}`;

  return { deltas, description };
}

function calculateRyuukyokuTransfers(
  result: RyuukyokuResult,
  dealerIndex?: number,
): TransferResult {
  const deltas = [0, 0, 0, 0];
  const hasNagashi = result.nagashiManganPlayers?.some(Boolean);

  if (hasNagashi && dealerIndex !== undefined) {
    // Nagashi mangan replaces tenpai/noten penalties entirely
    for (let winIdx = 0; winIdx < 4; winIdx++) {
      if (!result.nagashiManganPlayers![winIdx]) continue;
      const isDealer = winIdx === dealerIndex;
      for (let i = 0; i < 4; i++) {
        if (i === winIdx) continue;
        const payment = isDealer ? 4000 : (i === dealerIndex ? 4000 : 2000);
        deltas[i] -= payment;
        deltas[winIdx] += payment;
      }
    }
  } else {
    // Normal draw: tenpai/noten penalties
    const tenpaiCount = result.tenpaiStatus.filter(Boolean).length;
    const notenCount = 4 - tenpaiCount;

    if (tenpaiCount > 0 && tenpaiCount < 4) {
      const tenpaiReceive = 3000 / tenpaiCount;
      const notenPay = 3000 / notenCount;

      for (let i = 0; i < 4; i++) {
        deltas[i] = result.tenpaiStatus[i] ? tenpaiReceive : -notenPay;
      }
    }
  }

  // Build description
  if (hasNagashi) {
    const nagashiNames = result.nagashiManganPlayers!
      .map((n, i) => n ? `P${i + 1}` : null)
      .filter(Boolean);
    return {
      deltas,
      description: `流局満貫 (nagashi mangan) → ${nagashiNames.join(', ')}`,
    };
  }

  const tenpaiNames = result.tenpaiStatus
    .map((t, i) => t ? `P${i + 1}` : null)
    .filter(Boolean);
  const tCount = result.tenpaiStatus.filter(Boolean).length;
  const description = tCount === 0
    ? '全員不聴 (all noten)'
    : tCount === 4
    ? '全員聴牌 (all tenpai)'
    : `流局: ${tenpaiNames.join(', ')} 聴牌`;

  return { deltas, description };
}
