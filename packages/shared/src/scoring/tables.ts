/**
 * Complete Riichi Mahjong scoring tables.
 * All values are base points (before honba/riichi stick bonuses).
 * Tables indexed as [han][fu].
 */

// Non-dealer Ron: total paid by the discarder
export const NON_DEALER_RON: Record<number, Record<number, number>> = {
  1: { 30: 1000, 40: 1300, 50: 1600, 60: 2000, 70: 2300, 80: 2600, 90: 2900, 100: 3200, 110: 3600 },
  2: { 20: 1300, 25: 1600, 30: 2000, 40: 2600, 50: 3200, 60: 3900, 70: 4500, 80: 5200, 90: 5800, 100: 6400, 110: 7100 },
  3: { 20: 2600, 25: 3200, 30: 3900, 40: 5200, 50: 6400, 60: 7700, 70: 8000, 80: 8000, 90: 8000, 100: 8000, 110: 8000 },
  4: { 20: 5200, 25: 6400, 30: 7700, 40: 8000, 50: 8000, 60: 8000, 70: 8000, 80: 8000, 90: 8000, 100: 8000, 110: 8000 },
};

// Dealer Ron: total paid by the discarder
export const DEALER_RON: Record<number, Record<number, number>> = {
  1: { 30: 1500, 40: 2000, 50: 2400, 60: 2900, 70: 3400, 80: 3900, 90: 4400, 100: 4800, 110: 5300 },
  2: { 20: 2000, 25: 2400, 30: 2900, 40: 3900, 50: 4800, 60: 5800, 70: 6800, 80: 7700, 90: 8700, 100: 9600, 110: 10600 },
  3: { 20: 3900, 25: 4800, 30: 5800, 40: 7700, 50: 9600, 60: 11600, 70: 12000, 80: 12000, 90: 12000, 100: 12000, 110: 12000 },
  4: { 20: 7700, 25: 9600, 30: 11600, 40: 12000, 50: 12000, 60: 12000, 70: 12000, 80: 12000, 90: 12000, 100: 12000, 110: 12000 },
};

// Non-dealer Tsumo: [nonDealerPays, dealerPays]
export const NON_DEALER_TSUMO: Record<number, Record<number, [number, number]>> = {
  1: { 30: [300, 500], 40: [400, 700], 50: [400, 800], 60: [500, 1000], 70: [600, 1200], 80: [700, 1300], 90: [800, 1500], 100: [800, 1600], 110: [900, 1800] },
  2: { 20: [400, 700], 30: [500, 1000], 40: [700, 1300], 50: [800, 1600], 60: [1000, 2000], 70: [1200, 2300], 80: [1300, 2600], 90: [1500, 2900], 100: [1600, 3200], 110: [1800, 3600] },
  3: { 20: [700, 1300], 25: [800, 1600], 30: [1000, 2000], 40: [1300, 2600], 50: [1600, 3200], 60: [2000, 3900], 70: [2000, 4000], 80: [2000, 4000], 90: [2000, 4000], 100: [2000, 4000], 110: [2000, 4000] },
  4: { 20: [1300, 2600], 25: [1600, 3200], 30: [2000, 3900], 40: [2000, 4000], 50: [2000, 4000], 60: [2000, 4000], 70: [2000, 4000], 80: [2000, 4000], 90: [2000, 4000], 100: [2000, 4000], 110: [2000, 4000] },
};

// Dealer Tsumo: each non-dealer pays this amount
export const DEALER_TSUMO: Record<number, Record<number, number>> = {
  1: { 30: 500, 40: 700, 50: 800, 60: 1000, 70: 1200, 80: 1300, 90: 1500, 100: 1600, 110: 1800 },
  2: { 20: 700, 30: 1000, 40: 1300, 50: 1600, 60: 2000, 70: 2300, 80: 2600, 90: 2900, 100: 3200, 110: 3600 },
  3: { 20: 1300, 25: 1600, 30: 2000, 40: 2600, 50: 3200, 60: 3900, 70: 4000, 80: 4000, 90: 4000, 100: 4000, 110: 4000 },
  4: { 20: 2600, 25: 3200, 30: 3900, 40: 4000, 50: 4000, 60: 4000, 70: 4000, 80: 4000, 90: 4000, 100: 4000, 110: 4000 },
};

// Limit hands (5+ han)
export interface LimitHand {
  name: string;
  nameCn: string;
  nonDealerRon: number;
  dealerRon: number;
  nonDealerTsumo: [number, number]; // [nonDealerPays, dealerPays]
  dealerTsumo: number; // each non-dealer pays
}

export const LIMIT_HANDS: LimitHand[] = [
  { name: 'mangan',    nameCn: '満貫',   nonDealerRon: 8000,  dealerRon: 12000, nonDealerTsumo: [2000, 4000], dealerTsumo: 4000 },
  { name: 'haneman',   nameCn: '跳満',   nonDealerRon: 12000, dealerRon: 18000, nonDealerTsumo: [3000, 6000], dealerTsumo: 6000 },
  { name: 'baiman',    nameCn: '倍満',   nonDealerRon: 16000, dealerRon: 24000, nonDealerTsumo: [4000, 8000], dealerTsumo: 8000 },
  { name: 'sanbaiman', nameCn: '三倍満', nonDealerRon: 24000, dealerRon: 36000, nonDealerTsumo: [6000, 12000], dealerTsumo: 12000 },
  { name: 'yakuman',   nameCn: '役満',   nonDealerRon: 32000, dealerRon: 48000, nonDealerTsumo: [8000, 16000], dealerTsumo: 16000 },
];

export function getLimitHand(han: number): LimitHand | null {
  if (han >= 13) return LIMIT_HANDS[4]; // yakuman
  if (han >= 11) return LIMIT_HANDS[3]; // sanbaiman
  if (han >= 8) return LIMIT_HANDS[2];  // baiman
  if (han >= 6) return LIMIT_HANDS[1];  // haneman
  if (han >= 5) return LIMIT_HANDS[0];  // mangan
  return null;
}
