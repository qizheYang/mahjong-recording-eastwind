import { describe, it, expect } from 'vitest';
import {
  calculatePoints,
  calculateTransfers,
  calculateFinalScores,
  NON_DEALER_RON, DEALER_RON,
  NON_DEALER_TSUMO, DEALER_TSUMO,
  LIMIT_HANDS, getLimitHand,
  M_LEAGUE_RULES,
} from '@mahjong/shared';
import type { PointCalcInput, AgariResult, RyuukyokuResult, GamePlayer } from '@mahjong/shared';

// ──────────────────────────────────────────────────
// Scoring Tables
// ──────────────────────────────────────────────────
describe('Scoring Tables', () => {
  it('should have all limit hands defined', () => {
    expect(LIMIT_HANDS).toHaveLength(5);
    expect(LIMIT_HANDS[0].name).toBe('mangan');
    expect(LIMIT_HANDS[4].name).toBe('yakuman');
  });

  it('should return correct limit hand for han counts', () => {
    expect(getLimitHand(4)).toBeNull();
    expect(getLimitHand(5)?.name).toBe('mangan');
    expect(getLimitHand(6)?.name).toBe('haneman');
    expect(getLimitHand(7)?.name).toBe('haneman');
    expect(getLimitHand(8)?.name).toBe('baiman');
    expect(getLimitHand(10)?.name).toBe('baiman');
    expect(getLimitHand(11)?.name).toBe('sanbaiman');
    expect(getLimitHand(12)?.name).toBe('sanbaiman');
    expect(getLimitHand(13)?.name).toBe('yakuman');
    expect(getLimitHand(26)?.name).toBe('yakuman');
  });

  it('non-dealer ron 1han 30fu = 1000', () => {
    expect(NON_DEALER_RON[1][30]).toBe(1000);
  });

  it('dealer ron 2han 40fu = 3900', () => {
    expect(DEALER_RON[2][40]).toBe(3900);
  });

  it('non-dealer tsumo 2han 30fu = [500, 1000]', () => {
    expect(NON_DEALER_TSUMO[2][30]).toEqual([500, 1000]);
  });

  it('dealer tsumo 3han 30fu = 2000 each', () => {
    expect(DEALER_TSUMO[3][30]).toBe(2000);
  });
});

// ──────────────────────────────────────────────────
// Point Calculator
// ──────────────────────────────────────────────────
describe('Point Calculator', () => {
  // Ron cases
  describe('Ron', () => {
    it('non-dealer ron 1han 30fu = 1000', () => {
      const r = calculatePoints({ han: 1, fu: 30, isDealer: false, isTsumo: false });
      expect(r.total).toBe(1000);
      expect(r.ronPayment).toBe(1000);
      expect(r.limitName).toBeNull();
    });

    it('dealer ron 3han 40fu = 7700', () => {
      const r = calculatePoints({ han: 3, fu: 40, isDealer: true, isTsumo: false });
      expect(r.total).toBe(7700);
      expect(r.ronPayment).toBe(7700);
    });

    it('non-dealer ron 4han 30fu = mangan (8000, kiriage)', () => {
      const r = calculatePoints({ han: 4, fu: 30, isDealer: false, isTsumo: false });
      expect(r.total).toBe(8000);
      expect(r.limitName).toBe('mangan');
    });

    it('non-dealer ron 3han 70fu → mangan (8000)', () => {
      const r = calculatePoints({ han: 3, fu: 70, isDealer: false, isTsumo: false });
      expect(r.total).toBe(8000);
      expect(r.limitName).toBe('mangan');
    });

    it('dealer ron 4han 40fu → mangan (12000)', () => {
      const r = calculatePoints({ han: 4, fu: 40, isDealer: true, isTsumo: false });
      expect(r.total).toBe(12000);
      expect(r.limitName).toBe('mangan');
    });
  });

  // Tsumo cases
  describe('Tsumo', () => {
    it('non-dealer tsumo 1han 30fu: 300+300+500 = 1100', () => {
      const r = calculatePoints({ han: 1, fu: 30, isDealer: false, isTsumo: true });
      expect(r.tsumoNonDealerPayment).toBe(300);
      expect(r.tsumoDealerPayment).toBe(500);
      expect(r.total).toBe(300 * 2 + 500);
    });

    it('dealer tsumo 2han 30fu: 1000 each x3 = 3000', () => {
      const r = calculatePoints({ han: 2, fu: 30, isDealer: true, isTsumo: true });
      expect(r.tsumoNonDealerPayment).toBe(1000);
      expect(r.tsumoDealerPayment).toBe(0);
      expect(r.total).toBe(3000);
    });

    it('non-dealer tsumo 3han 25fu: 800+1600 = 3200', () => {
      const r = calculatePoints({ han: 3, fu: 25, isDealer: false, isTsumo: true });
      expect(r.tsumoNonDealerPayment).toBe(800);
      expect(r.tsumoDealerPayment).toBe(1600);
      expect(r.total).toBe(800 * 2 + 1600);
    });
  });

  // Limit hands
  describe('Limit Hands', () => {
    it('mangan ron non-dealer = 8000', () => {
      const r = calculatePoints({ han: 5, fu: 30, isDealer: false, isTsumo: false });
      expect(r.total).toBe(8000);
      expect(r.limitName).toBe('mangan');
    });

    it('mangan ron dealer = 12000', () => {
      const r = calculatePoints({ han: 5, fu: 30, isDealer: true, isTsumo: false });
      expect(r.total).toBe(12000);
    });

    it('haneman tsumo non-dealer: 3000+3000+6000 = 12000', () => {
      const r = calculatePoints({ han: 6, fu: 30, isDealer: false, isTsumo: true });
      expect(r.total).toBe(12000);
      expect(r.tsumoNonDealerPayment).toBe(3000);
      expect(r.tsumoDealerPayment).toBe(6000);
      expect(r.limitName).toBe('haneman');
    });

    it('baiman ron dealer = 24000', () => {
      const r = calculatePoints({ han: 8, fu: 30, isDealer: true, isTsumo: false });
      expect(r.total).toBe(24000);
      expect(r.limitName).toBe('baiman');
    });

    it('sanbaiman tsumo dealer: 12000 each x3 = 36000', () => {
      const r = calculatePoints({ han: 11, fu: 30, isDealer: true, isTsumo: true });
      expect(r.total).toBe(36000);
      expect(r.limitName).toBe('sanbaiman');
    });

    it('yakuman ron non-dealer = 32000', () => {
      const r = calculatePoints({ han: 13, fu: 30, isDealer: false, isTsumo: false });
      expect(r.total).toBe(32000);
      expect(r.limitName).toBe('yakuman');
    });

    it('yakuman tsumo dealer: 16000 each x3 = 48000', () => {
      const r = calculatePoints({ han: 13, fu: 30, isDealer: true, isTsumo: true });
      expect(r.total).toBe(48000);
      expect(r.limitName).toBe('yakuman');
    });
  });
});

// ──────────────────────────────────────────────────
// Transfer Calculator
// ──────────────────────────────────────────────────
describe('Transfer Calculator', () => {
  describe('Agari (win)', () => {
    it('non-dealer ron 1han 30fu, 0 honba, 0 riichi sticks', () => {
      const result: AgariResult = {
        type: 'agari', winnerIndex: 1, loserIndex: 2,
        isTsumo: false, han: 1, fu: 30,
        pointsWon: 1000, honbaBonus: 0, riichiSticksCollected: 0,
      };
      const { deltas } = calculateTransfers(result, 0, 0, 0);
      expect(deltas).toEqual([0, 1000, -1000, 0]);
    });

    it('dealer ron 3han 40fu with 2 honba, 1 riichi stick', () => {
      // Dealer (idx 0) rons player 3
      const result: AgariResult = {
        type: 'agari', winnerIndex: 0, loserIndex: 3,
        isTsumo: false, han: 3, fu: 40,
        pointsWon: 7700, honbaBonus: 600, riichiSticksCollected: 1,
      };
      // Ron: 7700 + 2*300 honba = 8300 from loser, +1000 riichi stick
      const { deltas } = calculateTransfers(result, 0, 2, 1);
      expect(deltas[0]).toBe(8300 + 1000); // dealer wins 9300
      expect(deltas[3]).toBe(-8300); // loser pays 8300
      expect(deltas[1]).toBe(0);
      expect(deltas[2]).toBe(0);
    });

    it('non-dealer tsumo 2han 30fu, 1 honba', () => {
      // Player 2 tsumos, dealer is player 0
      const result: AgariResult = {
        type: 'agari', winnerIndex: 2, loserIndex: null,
        isTsumo: true, han: 2, fu: 30,
        pointsWon: 2000, honbaBonus: 300, riichiSticksCollected: 0,
      };
      // Non-dealer tsumo 2han 30fu: non-dealer pays 500, dealer pays 1000
      // +1 honba: +100 per player
      const { deltas } = calculateTransfers(result, 0, 1, 0);
      expect(deltas[0]).toBe(-(1000 + 100)); // dealer pays 1100
      expect(deltas[1]).toBe(-(500 + 100));  // non-dealer pays 600
      expect(deltas[2]).toBe(1100 + 600 + 600); // winner gets 2300
      expect(deltas[3]).toBe(-(500 + 100));  // non-dealer pays 600
    });

    it('dealer tsumo mangan, 3 honba, 2 riichi sticks', () => {
      // Dealer (idx 0) tsumos
      const result: AgariResult = {
        type: 'agari', winnerIndex: 0, loserIndex: null,
        isTsumo: true, han: 5, fu: 30,
        pointsWon: 12000, honbaBonus: 900, riichiSticksCollected: 2,
      };
      // Dealer mangan tsumo: 4000 each + 3*100 honba per player
      const { deltas } = calculateTransfers(result, 0, 3, 2);
      const paymentEach = 4000 + 300; // 4300
      expect(deltas[1]).toBe(-paymentEach);
      expect(deltas[2]).toBe(-paymentEach);
      expect(deltas[3]).toBe(-paymentEach);
      expect(deltas[0]).toBe(paymentEach * 3 + 2000); // + 2 riichi sticks
    });

    it('total point movement sums to zero (ignoring riichi sticks from table)', () => {
      const result: AgariResult = {
        type: 'agari', winnerIndex: 1, loserIndex: null,
        isTsumo: true, han: 3, fu: 30,
        pointsWon: 4000, honbaBonus: 0, riichiSticksCollected: 0,
      };
      const { deltas } = calculateTransfers(result, 0, 0, 0);
      const sum = deltas.reduce((a, b) => a + b, 0);
      expect(sum).toBe(0);
    });
  });

  describe('Ryuukyoku (draw)', () => {
    it('1 tenpai, 3 noten: tenpai gets +3000, noten lose -1000 each', () => {
      const result: RyuukyokuResult = {
        type: 'ryuukyoku', tenpaiStatus: [true, false, false, false],
      };
      const { deltas } = calculateTransfers(result, 0, 0, 0);
      expect(deltas).toEqual([3000, -1000, -1000, -1000]);
    });

    it('2 tenpai, 2 noten: tenpai get +1500, noten lose -1500', () => {
      const result: RyuukyokuResult = {
        type: 'ryuukyoku', tenpaiStatus: [true, true, false, false],
      };
      const { deltas } = calculateTransfers(result, 0, 0, 0);
      expect(deltas).toEqual([1500, 1500, -1500, -1500]);
    });

    it('3 tenpai, 1 noten: tenpai get +1000, noten loses -3000', () => {
      const result: RyuukyokuResult = {
        type: 'ryuukyoku', tenpaiStatus: [true, true, true, false],
      };
      const { deltas } = calculateTransfers(result, 0, 0, 0);
      expect(deltas).toEqual([1000, 1000, 1000, -3000]);
    });

    it('all tenpai: no point movement', () => {
      const result: RyuukyokuResult = {
        type: 'ryuukyoku', tenpaiStatus: [true, true, true, true],
      };
      const { deltas } = calculateTransfers(result, 0, 0, 0);
      expect(deltas).toEqual([0, 0, 0, 0]);
    });

    it('all noten: no point movement', () => {
      const result: RyuukyokuResult = {
        type: 'ryuukyoku', tenpaiStatus: [false, false, false, false],
      };
      const { deltas } = calculateTransfers(result, 0, 0, 0);
      expect(deltas).toEqual([0, 0, 0, 0]);
    });

    it('ryuukyoku deltas sum to zero', () => {
      const result: RyuukyokuResult = {
        type: 'ryuukyoku', tenpaiStatus: [true, false, true, false],
      };
      const { deltas } = calculateTransfers(result, 0, 0, 0);
      expect(deltas.reduce((a, b) => a + b, 0)).toBe(0);
    });
  });
});

// ──────────────────────────────────────────────────
// Final Score Calculator
// ──────────────────────────────────────────────────
describe('Final Score Calculator', () => {
  function makePlayers(pointsList: number[]): GamePlayer[] {
    return pointsList.map((pts, i) => ({
      id: `p${i}`, name: `Player ${i + 1}`, points: pts, initialSeat: (['east', 'south', 'west', 'north'] as const)[i],
    }));
  }

  it('standard game: all different scores', () => {
    // P0=35000, P1=30000, P2=20000, P3=15000
    const players = makePlayers([35000, 30000, 20000, 15000]);
    const scores = calculateFinalScores(players, 0, M_LEAGUE_RULES);

    // Sorted by points: P0(35k), P1(30k), P2(20k), P3(15k)
    expect(scores[0].name).toBe('Player 1');
    expect(scores[0].placement).toBe(1);
    expect(scores[1].name).toBe('Player 2');
    expect(scores[1].placement).toBe(2);
    expect(scores[2].name).toBe('Player 3');
    expect(scores[2].placement).toBe(3);
    expect(scores[3].name).toBe('Player 4');
    expect(scores[3].placement).toBe(4);

    // gameScore = (rawPoints - 30000)/1000 + uma + oka(for 1st)
    // P0: (35000-30000)/1000 + 30 + 20 = 5+30+20 = 55
    expect(scores[0].gameScore).toBe(55);
    // P1: (30000-30000)/1000 + 10 = 10
    expect(scores[1].gameScore).toBe(10);
    // P2: (20000-30000)/1000 + (-10) = -10+(-10) = -20
    expect(scores[2].gameScore).toBe(-20);
    // P3: (15000-30000)/1000 + (-30) = -15+(-30) = -45
    expect(scores[3].gameScore).toBe(-45);

    // Total game score should sum to 0
    const total = scores.reduce((sum, s) => sum + s.gameScore, 0);
    expect(total).toBe(0);
  });

  it('starting positions: all at 25000', () => {
    const players = makePlayers([25000, 25000, 25000, 25000]);
    const scores = calculateFinalScores(players, 0, M_LEAGUE_RULES);

    // All tied: shared uma and shared oka
    // All same placement means all are 1st
    // Uma: (30+10+(-10)+(-30))/4 = 0
    // Oka: 20 split 4 ways = 5 each
    // gameScore = (25000-30000)/1000 + 0 + 5 = -5+0+5 = 0
    scores.forEach(s => {
      expect(s.gameScore).toBe(0);
    });
  });

  it('handles riichi sticks on table (awarded to highest scorer)', () => {
    const players = makePlayers([30000, 27000, 22000, 18000]);
    // 3 riichi sticks on table = 3000 points to highest scorer
    const scores = calculateFinalScores(players, 3, M_LEAGUE_RULES);

    // P0 gets the 3000, so raw = 33000
    expect(scores[0].rawPoints).toBe(33000);
    expect(scores[1].rawPoints).toBe(27000);
  });

  it('tied placement: two players with same score', () => {
    // P0=30000, P1=30000, P2=25000, P3=15000
    const players = makePlayers([30000, 30000, 25000, 15000]);
    const scores = calculateFinalScores(players, 0, M_LEAGUE_RULES);

    // P0 and P1 tied for 1st
    expect(scores[0].placement).toBe(1);
    expect(scores[1].placement).toBe(1);
    expect(scores[2].placement).toBe(3); // skips 2nd
    expect(scores[3].placement).toBe(4);

    // Shared uma for 1st+2nd: (30+10)/2 = 20
    expect(scores[0].uma).toBe(20);
    expect(scores[1].uma).toBe(20);
    // 3rd uma = -10
    expect(scores[2].uma).toBe(-10);
  });

  it('game score sums to zero for any configuration', () => {
    const configs = [
      [40000, 30000, 20000, 10000],
      [25000, 25000, 25000, 25000],
      [50000, 20000, 15000, 15000],
      [35000, 35000, 15000, 15000],
    ];

    for (const pts of configs) {
      const players = makePlayers(pts);
      const scores = calculateFinalScores(players, 0, M_LEAGUE_RULES);
      const total = scores.reduce((sum, s) => sum + s.gameScore, 0);
      expect(Math.abs(total)).toBeLessThan(0.1);
    }
  });
});
