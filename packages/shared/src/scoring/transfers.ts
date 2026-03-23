import type { HandResult, AgariResult, MultiAgariResult, RyuukyokuResult, GamePlayer } from '../types/game.js';
import type { Ruleset } from '../constants.js';
import { calculatePoints } from './calculator.js';

export interface TransferResult {
  /** Point deltas for each player [p0, p1, p2, p3] */
  deltas: number[];
  /** Description of the transfer for display */
  description: string;
}

export interface TransferOptions {
  dealerIndex: number;
  honbaCount: number;
  riichiSticksOnTable: number;
  kiriageMangan?: boolean;
  // 2v2 special rules
  onlySubtract?: boolean;
  teammateNoTsumoPayment?: boolean;
  scma2v2DrawPenalty?: boolean;
  /** Players array needed to determine teammates */
  players?: GamePlayer[];
}

function areTeammates(a: number, b: number, players?: GamePlayer[]): boolean {
  if (!players) return false;
  const teamA = players[a]?.team;
  const teamB = players[b]?.team;
  return !!(teamA && teamB && teamA === teamB);
}

/**
 * Calculate point transfers for a hand result.
 * Returns the delta (change) for each player's score.
 *
 * Backwards-compatible: accepts either the new options object or legacy positional args.
 */
export function calculateTransfers(
  result: HandResult,
  dealerIndexOrOpts: number | TransferOptions,
  honbaCount?: number,
  riichiSticksOnTable?: number,
  kiriageMangan?: boolean,
): TransferResult {
  // Normalise to TransferOptions
  const opts: TransferOptions = typeof dealerIndexOrOpts === 'number'
    ? { dealerIndex: dealerIndexOrOpts, honbaCount: honbaCount!, riichiSticksOnTable: riichiSticksOnTable!, kiriageMangan }
    : dealerIndexOrOpts;

  if (result.type === 'agari') {
    return calculateAgariTransfers(result, opts);
  } else if (result.type === 'multi_agari') {
    return calculateMultiAgariTransfers(result, opts);
  } else {
    return calculateRyuukyokuTransfers(result, opts);
  }
}

function calculateAgariTransfers(
  result: AgariResult,
  opts: TransferOptions,
): TransferResult {
  const deltas = [0, 0, 0, 0];
  const { winnerIndex, loserIndex, isTsumo, han, fu } = result;
  const { dealerIndex, honbaCount, riichiSticksOnTable, kiriageMangan, onlySubtract, teammateNoTsumoPayment, players } = opts;
  const isDealer = winnerIndex === dealerIndex;

  const calc = calculatePoints({ han, fu, isDealer, isTsumo, kiriageMangan, yakumanCount: result.yakumanCount });

  if (isTsumo) {
    for (let i = 0; i < 4; i++) {
      if (i === winnerIndex) continue;

      // Teammate pays 0 on tsumo if teammateNoTsumoPayment is enabled
      if (teammateNoTsumoPayment && areTeammates(i, winnerIndex, players)) {
        continue;
      }

      let payment: number;
      if (isDealer) {
        payment = calc.tsumoNonDealerPayment;
      } else {
        payment = i === dealerIndex
          ? calc.tsumoDealerPayment
          : calc.tsumoNonDealerPayment;
      }

      payment += honbaCount * 100;

      deltas[i] -= payment;
      if (!onlySubtract) {
        deltas[winnerIndex] += payment;
      }
    }
  } else {
    // Ron: discarder pays full amount
    let payment = calc.ronPayment;
    payment += honbaCount * 300;

    deltas[loserIndex!] -= payment;
    if (!onlySubtract) {
      deltas[winnerIndex] += payment;
    }
  }

  // Winner collects riichi sticks on table
  // With onlySubtract, winner gets nothing. With noRiichiDeposit there are no sticks.
  // So riichi collection only happens in normal mode.
  if (!onlySubtract && riichiSticksOnTable > 0) {
    const riichiBonus = riichiSticksOnTable * 1000;
    deltas[winnerIndex] += riichiBonus;
  }

  // Build description
  const limitStr = calc.limitNameCn ? ` (${calc.limitNameCn})` : '';
  const honbaStr = honbaCount > 0 ? ` +${honbaCount * 300} honba` : '';
  const riichiBonus = (!onlySubtract && riichiSticksOnTable > 0) ? riichiSticksOnTable * 1000 : 0;
  const riichiStr = riichiBonus > 0 ? ` +${riichiBonus} riichi` : '';
  const subtractTag = onlySubtract ? ' [只减不加]' : '';
  const description = isTsumo
    ? `Tsumo ${han}han/${fu}fu${limitStr}: ${calc.total}点${honbaStr}${riichiStr}${subtractTag}`
    : `Ron ${han}han/${fu}fu${limitStr}: ${calc.ronPayment}点${honbaStr}${riichiStr}${subtractTag}`;

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
  opts: TransferOptions,
): TransferResult {
  const deltas = [0, 0, 0, 0];
  const { loserIndex, winners } = result;
  const { dealerIndex, honbaCount, riichiSticksOnTable, kiriageMangan, onlySubtract } = opts;

  for (const w of winners) {
    const isDealer = w.winnerIndex === dealerIndex;
    const calc = calculatePoints({ han: w.han, fu: w.fu, isDealer, isTsumo: false, kiriageMangan, yakumanCount: w.yakumanCount });

    let payment = calc.ronPayment;
    payment += honbaCount * 300;

    deltas[loserIndex] -= payment;
    if (!onlySubtract) {
      deltas[w.winnerIndex] += payment;
    }
  }

  // Riichi sticks
  if (!onlySubtract && riichiSticksOnTable > 0) {
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
  const subtractTag = onlySubtract ? ' [只减不加]' : '';
  const description = `Multi-ron: ${parts.join(', ')}${subtractTag}`;

  return { deltas, description };
}

/**
 * SCMA 2v2 custom draw penalty table.
 * Teammates never pay each other. Doubled amounts. Only opponents lose points.
 *
 * | Tenpai situation                | Result                                |
 * |--------------------------------|---------------------------------------|
 * | 0 tenpai                       | Nothing                               |
 * | 1 tenpai                       | Teammate unchanged, 2 opponents −2000 each |
 * | 1 from each team tenpai        | Nothing                               |
 * | 1 team both tenpai, other none | Each noten opponent −3000             |
 * | 3 tenpai                       | Noten player −4000                    |
 * | 4 tenpai                       | Nothing                               |
 */
function calculateScma2v2DrawTransfers(
  result: RyuukyokuResult,
  players: GamePlayer[],
): TransferResult {
  const deltas = [0, 0, 0, 0];
  const tenpai = result.tenpaiStatus;
  const tenpaiCount = tenpai.filter(Boolean).length;

  if (tenpaiCount === 0 || tenpaiCount === 4) {
    // Nothing happens
  } else if (tenpaiCount === 1) {
    // 1 tenpai: 2 opponents each −2000, teammate unchanged
    const tenpaiIdx = tenpai.indexOf(true);
    for (let i = 0; i < 4; i++) {
      if (i === tenpaiIdx) continue;
      if (areTeammates(i, tenpaiIdx, players)) continue;
      deltas[i] -= 2000;
    }
  } else if (tenpaiCount === 2) {
    // Check if same team or different teams
    const tenpaiIndices = tenpai.map((t, i) => t ? i : -1).filter(i => i >= 0);
    const sameTeam = areTeammates(tenpaiIndices[0], tenpaiIndices[1], players);

    if (sameTeam) {
      // One team both tenpai, other team none → each noten opponent −3000
      for (let i = 0; i < 4; i++) {
        if (!tenpai[i]) {
          deltas[i] -= 3000;
        }
      }
    }
    // Different teams (1 from each): nothing happens
  } else if (tenpaiCount === 3) {
    // 3 tenpai: the 1 noten player −4000
    for (let i = 0; i < 4; i++) {
      if (!tenpai[i]) {
        deltas[i] -= 4000;
      }
    }
  }

  // Build description
  const tenpaiNames = tenpai
    .map((t, i) => t ? `P${i + 1}` : null)
    .filter(Boolean);
  const tag = ' [2v2罚符]';
  const description = tenpaiCount === 0
    ? `全員不聴 (all noten)${tag}`
    : tenpaiCount === 4
    ? `全員聴牌 (all tenpai)${tag}`
    : `流局: ${tenpaiNames.join(', ')} 聴牌${tag}`;

  return { deltas, description };
}

function calculateRyuukyokuTransfers(
  result: RyuukyokuResult & { subManganDraw?: boolean },
  opts: TransferOptions,
): TransferResult {
  const { dealerIndex, scma2v2DrawPenalty, players } = opts;

  // Sub-mangan draw: no point changes at all
  if (result.subManganDraw) {
    return { deltas: [0, 0, 0, 0], description: '不足満貫 → 流局 (無変動)' };
  }

  // SCMA 2v2 custom draw penalty
  if (scma2v2DrawPenalty && players) {
    return calculateScma2v2DrawTransfers(result, players);
  }

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
