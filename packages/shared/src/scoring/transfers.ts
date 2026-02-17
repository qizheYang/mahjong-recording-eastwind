import type { HandResult, AgariResult, RyuukyokuResult } from '../types/game.js';
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
): TransferResult {
  if (result.type === 'agari') {
    return calculateAgariTransfers(result, dealerIndex, honbaCount, riichiSticksOnTable);
  } else {
    return calculateRyuukyokuTransfers(result, dealerIndex);
  }
}

function calculateAgariTransfers(
  result: AgariResult,
  dealerIndex: number,
  honbaCount: number,
  riichiSticksOnTable: number,
): TransferResult {
  const deltas = [0, 0, 0, 0];
  const { winnerIndex, loserIndex, isTsumo, han, fu } = result;
  const isDealer = winnerIndex === dealerIndex;

  const calc = calculatePoints({ han, fu, isDealer, isTsumo });

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

function calculateRyuukyokuTransfers(
  result: RyuukyokuResult,
  dealerIndex?: number,
): TransferResult {
  const deltas = [0, 0, 0, 0];

  // Nagashi mangan: winner receives mangan tsumo payment
  if (result.nagashiManganIndex !== undefined && dealerIndex !== undefined) {
    const winIdx = result.nagashiManganIndex;
    const isDealer = winIdx === dealerIndex;
    for (let i = 0; i < 4; i++) {
      if (i === winIdx) continue;
      const payment = isDealer ? 4000 : (i === dealerIndex ? 4000 : 2000);
      deltas[i] -= payment;
      deltas[winIdx] += payment;
    }
    return {
      deltas,
      description: `流局満貫 (nagashi mangan) → P${winIdx + 1}`,
    };
  }

  const tenpaiCount = result.tenpaiStatus.filter(Boolean).length;
  const notenCount = 4 - tenpaiCount;

  if (tenpaiCount > 0 && tenpaiCount < 4) {
    const tenpaiReceive = 3000 / tenpaiCount;
    const notenPay = 3000 / notenCount;

    for (let i = 0; i < 4; i++) {
      deltas[i] = result.tenpaiStatus[i] ? tenpaiReceive : -notenPay;
    }
  }
  // All tenpai or all noten: no point movement

  const tenpaiNames = result.tenpaiStatus
    .map((t, i) => t ? `P${i + 1}` : null)
    .filter(Boolean);
  const description = tenpaiCount === 0
    ? '全員不聴 (all noten)'
    : tenpaiCount === 4
    ? '全員聴牌 (all tenpai)'
    : `流局: ${tenpaiNames.join(', ')} 聴牌`;

  return { deltas, description };
}
