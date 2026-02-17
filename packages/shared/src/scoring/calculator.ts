import {
  NON_DEALER_RON, DEALER_RON,
  NON_DEALER_TSUMO, DEALER_TSUMO,
  getLimitHand,
} from './tables.js';

export interface PointCalcInput {
  han: number;
  fu: number;
  isDealer: boolean;
  isTsumo: boolean;
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

export function calculatePoints(input: PointCalcInput): PointCalcResult {
  const { han, fu, isDealer, isTsumo } = input;

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
