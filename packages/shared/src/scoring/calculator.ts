import {
  NON_DEALER_RON, DEALER_RON,
  NON_DEALER_TSUMO, DEALER_TSUMO,
  LIMIT_HANDS, getLimitHand,
} from './tables.js';
import { YAKUMAN_LIST } from '../constants.js';

export interface PointCalcInput {
  han: number;
  fu: number;
  isDealer: boolean;
  isTsumo: boolean;
  kiriageMangan?: boolean;
  yakumanCount?: number; // multiplier for yakuman (1=single, 2=double, etc.)
}

export interface PointCalcResult {
  /** Total points won (ron: discarder pays this; tsumo: sum of all payments) */
  total: number;
  /** For ron: what the discarder pays */
  ronPayment: number;
  /** For tsumo: what each non-dealer pays */
  tsumoNonDealerPayment: number;
  /** For tsumo: what the dealer pays (0 if winner is dealer) */
  tsumoDealerPayment: number;
  /** Limit hand name if applicable */
  limitName: string | null;
  limitNameCn: string | null;
}

/**
 * Calculate the yakuman multiplier from a list of selected yakuman.
 * Each normal yakuman = 1x, double yakuman variants = 2x (if doubleYakumanEnabled).
 * multipleYakumanEnabled controls whether combining separate yakuman stacks (e.g. tsuiisou + shousuushii = 2x).
 */
export function calculateYakumanMultiplier(yakumanList: string[], doubleYakumanEnabled: boolean, multipleYakumanEnabled?: boolean): number {
  if (yakumanList.length === 0) return 1;
  let multiplier = 0;
  for (const id of yakumanList) {
    const def = YAKUMAN_LIST.find(y => y.id === id);
    if (def && def.isDouble && doubleYakumanEnabled) {
      multiplier += 2;
    } else {
      multiplier += 1;
    }
  }
  // When multiple yakuman stacking is disabled, cap at the value of a single selected yakuman
  if (!multipleYakumanEnabled && yakumanList.length > 1) {
    return 1;
  }
  return Math.max(1, multiplier);
}

/**
 * Calculate points for yakuman with a given multiplier.
 */
function calculateYakumanPoints(isDealer: boolean, isTsumo: boolean, yakumanCount: number): PointCalcResult {
  const base = LIMIT_HANDS[4]; // yakuman base values
  const limitName = yakumanCount >= 3 ? 'tripleYakuman'
    : yakumanCount >= 2 ? 'doubleYakuman'
    : 'yakuman';
  const limitNameCn = yakumanCount >= 3 ? '三倍役満'
    : yakumanCount >= 2 ? '二倍役満'
    : '役満';

  if (isTsumo) {
    if (isDealer) {
      const each = base.dealerTsumo * yakumanCount;
      return { total: each * 3, ronPayment: 0, tsumoNonDealerPayment: each, tsumoDealerPayment: 0, limitName, limitNameCn };
    } else {
      const [ndPay, dPay] = base.nonDealerTsumo;
      return {
        total: (ndPay * yakumanCount * 2) + (dPay * yakumanCount),
        ronPayment: 0,
        tsumoNonDealerPayment: ndPay * yakumanCount,
        tsumoDealerPayment: dPay * yakumanCount,
        limitName, limitNameCn,
      };
    }
  } else {
    const payment = (isDealer ? base.dealerRon : base.nonDealerRon) * yakumanCount;
    return { total: payment, ronPayment: payment, tsumoNonDealerPayment: 0, tsumoDealerPayment: 0, limitName, limitNameCn };
  }
}

export function calculatePoints(input: PointCalcInput): PointCalcResult {
  const { han, fu, isDealer, isTsumo } = input;

  // Kiriage mangan: 4han/30fu and 3han/60fu round up to mangan
  if (input.kiriageMangan && ((han === 4 && fu === 30) || (han === 3 && fu === 60))) {
    return calculatePoints({ han: 5, fu: 30, isDealer, isTsumo });
  }

  // Yakuman with multiplier > 1 (double/triple yakuman)
  if (han >= 13 && input.yakumanCount && input.yakumanCount > 1) {
    return calculateYakumanPoints(isDealer, isTsumo, input.yakumanCount);
  }

  // Check for limit hands (5+ han)
  const limit = getLimitHand(han);
  if (limit) {
    if (isTsumo) {
      if (isDealer) {
        const each = limit.dealerTsumo;
        return {
          total: each * 3,
          ronPayment: 0,
          tsumoNonDealerPayment: each,
          tsumoDealerPayment: 0,
          limitName: limit.name,
          limitNameCn: limit.nameCn,
        };
      } else {
        const [ndPay, dPay] = limit.nonDealerTsumo;
        return {
          total: ndPay * 2 + dPay,
          ronPayment: 0,
          tsumoNonDealerPayment: ndPay,
          tsumoDealerPayment: dPay,
          limitName: limit.name,
          limitNameCn: limit.nameCn,
        };
      }
    } else {
      const payment = isDealer ? limit.dealerRon : limit.nonDealerRon;
      return {
        total: payment,
        ronPayment: payment,
        tsumoNonDealerPayment: 0,
        tsumoDealerPayment: 0,
        limitName: limit.name,
        limitNameCn: limit.nameCn,
      };
    }
  }

  // Table lookup for 1-4 han
  if (isTsumo) {
    if (isDealer) {
      const table = DEALER_TSUMO[han];
      const each = table?.[fu];
      if (each === undefined) {
        // Fu higher than table entries → mangan
        return calculatePoints({ han: 5, fu: 30, isDealer, isTsumo });
      }
      return {
        total: each * 3,
        ronPayment: 0,
        tsumoNonDealerPayment: each,
        tsumoDealerPayment: 0,
        limitName: null,
        limitNameCn: null,
      };
    } else {
      const table = NON_DEALER_TSUMO[han];
      const entry = table?.[fu];
      if (entry === undefined) {
        return calculatePoints({ han: 5, fu: 30, isDealer, isTsumo });
      }
      const [ndPay, dPay] = entry;
      return {
        total: ndPay * 2 + dPay,
        ronPayment: 0,
        tsumoNonDealerPayment: ndPay,
        tsumoDealerPayment: dPay,
        limitName: null,
        limitNameCn: null,
      };
    }
  } else {
    const table = isDealer ? DEALER_RON[han] : NON_DEALER_RON[han];
    const payment = table?.[fu];
    if (payment === undefined) {
      return calculatePoints({ han: 5, fu: 30, isDealer, isTsumo });
    }
    // Check if this table value is actually mangan
    const manganThreshold = isDealer ? 12000 : 8000;
    const limitName = payment >= manganThreshold ? 'mangan' : null;
    return {
      total: payment,
      ronPayment: payment,
      tsumoNonDealerPayment: 0,
      tsumoDealerPayment: 0,
      limitName,
      limitNameCn: limitName ? '満貫' : null,
    };
  }
}
