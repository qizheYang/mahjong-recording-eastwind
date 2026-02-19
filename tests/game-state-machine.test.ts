import { describe, it, expect, beforeEach } from 'vitest';
import {
  processHandResult, undoLastHand, determineNextState, isAllLastHand,
  M_LEAGUE_RULES, calculateFinalScores, evaluateScoreFormula,
} from '@mahjong/shared';
import type { Game, GamePlayer, HandResultInput, HandResult } from '@mahjong/shared';

function createTestGame(): Game {
  return {
    id: 'test-game',
    roomCode: 'TEST',
    players: [
      { id: 'p0', name: 'East', points: 25000, initialSeat: 'east' },
      { id: 'p1', name: 'South', points: 25000, initialSeat: 'south' },
      { id: 'p2', name: 'West', points: 25000, initialSeat: 'west' },
      { id: 'p3', name: 'North', points: 25000, initialSeat: 'north' },
    ],
    hands: [],
    currentRound: { wind: 'east', number: 1 },
    currentDealer: 0,
    honbaCount: 0,
    riichiSticks: 0,
    status: 'in_progress',
    ruleset: { ...M_LEAGUE_RULES },
  };
}

// ──────────────────────────────────────────────────
// isAllLastHand
// ──────────────────────────────────────────────────
describe('isAllLastHand', () => {
  it('East 1 is not All Last', () => {
    const game = createTestGame();
    expect(isAllLastHand(game)).toBe(false);
  });

  it('South 4 is All Last', () => {
    const game = createTestGame();
    game.currentRound = { wind: 'south', number: 4 };
    expect(isAllLastHand(game)).toBe(true);
  });

  it('South 3 is not All Last', () => {
    const game = createTestGame();
    game.currentRound = { wind: 'south', number: 3 };
    expect(isAllLastHand(game)).toBe(false);
  });
});

// ──────────────────────────────────────────────────
// determineNextState
// ──────────────────────────────────────────────────
describe('determineNextState', () => {
  let game: Game;
  beforeEach(() => { game = createTestGame(); });

  it('non-dealer win → rotate dealer', () => {
    const result: HandResult = {
      type: 'agari', winnerIndex: 1, loserIndex: 0,
      isTsumo: false, han: 1, fu: 30, pointsWon: 1000,
      honbaBonus: 0, riichiSticksCollected: 0,
    };
    const action = determineNextState(game, result);
    expect(action.type).toBe('rotate_dealer');
  });

  it('dealer win → renchan', () => {
    const result: HandResult = {
      type: 'agari', winnerIndex: 0, loserIndex: 1,
      isTsumo: false, han: 2, fu: 30, pointsWon: 2000,
      honbaBonus: 0, riichiSticksCollected: 0,
    };
    const action = determineNextState(game, result);
    expect(action.type).toBe('renchan');
  });

  it('ryuukyoku dealer tenpai → renchan', () => {
    const result: HandResult = {
      type: 'ryuukyoku', tenpaiStatus: [true, false, false, false],
    };
    const action = determineNextState(game, result);
    expect(action.type).toBe('renchan');
  });

  it('ryuukyoku dealer noten → rotate (honba carries)', () => {
    const result: HandResult = {
      type: 'ryuukyoku', tenpaiStatus: [false, true, false, false],
    };
    const action = determineNextState(game, result);
    expect(action.type).toBe('rotate_dealer');
    if (action.type === 'rotate_dealer') {
      expect(action.resetHonba).toBe(false);
    }
  });

  describe('All Last (South 4)', () => {
    beforeEach(() => {
      game.currentRound = { wind: 'south', number: 4 };
      game.currentDealer = 3;
    });

    it('non-dealer win → end game', () => {
      const result: HandResult = {
        type: 'agari', winnerIndex: 1, loserIndex: 2,
        isTsumo: false, han: 1, fu: 30, pointsWon: 1000,
        honbaBonus: 0, riichiSticksCollected: 0,
      };
      const action = determineNextState(game, result);
      expect(action.type).toBe('end_game');
    });

    it('dealer win → renchan (continue)', () => {
      const result: HandResult = {
        type: 'agari', winnerIndex: 3, loserIndex: 1,
        isTsumo: false, han: 2, fu: 30, pointsWon: 2000,
        honbaBonus: 0, riichiSticksCollected: 0,
      };
      const action = determineNextState(game, result);
      expect(action.type).toBe('renchan');
    });

    it('ryuukyoku dealer tenpai → renchan', () => {
      const result: HandResult = {
        type: 'ryuukyoku', tenpaiStatus: [false, false, false, true],
      };
      const action = determineNextState(game, result);
      expect(action.type).toBe('renchan');
    });

    it('ryuukyoku dealer noten → end game', () => {
      const result: HandResult = {
        type: 'ryuukyoku', tenpaiStatus: [true, false, false, false],
      };
      const action = determineNextState(game, result);
      expect(action.type).toBe('end_game');
    });
  });
});

// ──────────────────────────────────────────────────
// processHandResult - round progression
// ──────────────────────────────────────────────────
describe('processHandResult', () => {
  let game: Game;
  beforeEach(() => { game = createTestGame(); });

  it('non-dealer win in East 1 → advances to East 2', () => {
    const input: HandResultInput = {
      resultType: 'agari', winnerIndex: 1, loserIndex: 0,
      isTsumo: false, han: 1, fu: 30,
    };
    processHandResult(game, input);
    expect(game.currentRound).toEqual({ wind: 'east', number: 2 });
    expect(game.currentDealer).toBe(1);
    expect(game.honbaCount).toBe(0);
  });

  it('dealer win in East 1 → stays East 1 with honba++', () => {
    const input: HandResultInput = {
      resultType: 'agari', winnerIndex: 0, loserIndex: 1,
      isTsumo: false, han: 2, fu: 30,
    };
    processHandResult(game, input);
    expect(game.currentRound).toEqual({ wind: 'east', number: 1 });
    expect(game.currentDealer).toBe(0);
    expect(game.honbaCount).toBe(1);
  });

  it('applies correct point changes for ron', () => {
    const input: HandResultInput = {
      resultType: 'agari', winnerIndex: 2, loserIndex: 3,
      isTsumo: false, han: 3, fu: 30,
    };
    // Non-dealer ron 3han 30fu = 3900
    processHandResult(game, input);
    expect(game.players[2].points).toBe(25000 + 3900);
    expect(game.players[3].points).toBe(25000 - 3900);
    expect(game.players[0].points).toBe(25000); // unaffected
    expect(game.players[1].points).toBe(25000); // unaffected
  });

  it('applies correct point changes for tsumo', () => {
    const input: HandResultInput = {
      resultType: 'agari', winnerIndex: 1, isTsumo: true,
      han: 2, fu: 30,
    };
    // Non-dealer tsumo 2han 30fu: non-dealer pays 500, dealer pays 1000
    processHandResult(game, input);
    expect(game.players[0].points).toBe(25000 - 1000); // dealer
    expect(game.players[1].points).toBe(25000 + 2000);  // winner: 500+500+1000
    expect(game.players[2].points).toBe(25000 - 500);  // non-dealer
    expect(game.players[3].points).toBe(25000 - 500);  // non-dealer
  });

  it('progresses through full East round (4 non-dealer wins)', () => {
    for (let i = 0; i < 4; i++) {
      const dealerIdx = i;
      const winnerIdx = (i + 1) % 4;
      const input: HandResultInput = {
        resultType: 'agari', winnerIndex: winnerIdx, loserIndex: dealerIdx,
        isTsumo: false, han: 1, fu: 30,
      };
      processHandResult(game, input);
    }
    // After 4 rotations through East, we're in South 1
    expect(game.currentRound).toEqual({ wind: 'south', number: 1 });
    expect(game.currentDealer).toBe(0);
  });

  it('ryuukyoku with dealer noten → honba increases, round advances', () => {
    const input: HandResultInput = {
      resultType: 'ryuukyoku',
      tenpaiStatus: [false, true, false, false],
    };
    processHandResult(game, input);
    expect(game.currentRound).toEqual({ wind: 'east', number: 2 });
    expect(game.currentDealer).toBe(1);
    expect(game.honbaCount).toBe(1); // honba carries on dealer noten
  });

  it('ryuukyoku with dealer tenpai → renchan with honba++', () => {
    const input: HandResultInput = {
      resultType: 'ryuukyoku',
      tenpaiStatus: [true, false, false, false],
    };
    processHandResult(game, input);
    expect(game.currentRound).toEqual({ wind: 'east', number: 1 });
    expect(game.currentDealer).toBe(0);
    expect(game.honbaCount).toBe(1);
  });

  it('ryuukyoku point transfers: 1 tenpai gets +3000, 3 noten get -1000', () => {
    const input: HandResultInput = {
      resultType: 'ryuukyoku',
      tenpaiStatus: [true, false, false, false],
    };
    processHandResult(game, input);
    expect(game.players[0].points).toBe(25000 + 3000);
    expect(game.players[1].points).toBe(25000 - 1000);
    expect(game.players[2].points).toBe(25000 - 1000);
    expect(game.players[3].points).toBe(25000 - 1000);
  });

  it('total points are always conserved (100000)', () => {
    // Play several hands and verify conservation
    processHandResult(game, {
      resultType: 'agari', winnerIndex: 0, loserIndex: 1,
      isTsumo: false, han: 3, fu: 30,
    });
    let total = game.players.reduce((s, p) => s + p.points, 0);
    expect(total).toBe(100000);

    processHandResult(game, {
      resultType: 'agari', winnerIndex: 2, isTsumo: true,
      han: 2, fu: 30,
    });
    total = game.players.reduce((s, p) => s + p.points, 0);
    expect(total).toBe(100000);

    processHandResult(game, {
      resultType: 'ryuukyoku', tenpaiStatus: [true, true, false, false],
    });
    total = game.players.reduce((s, p) => s + p.points, 0);
    expect(total).toBe(100000);
  });

  it('game ends after non-dealer win in South 4 (All Last)', () => {
    game.currentRound = { wind: 'south', number: 4 };
    game.currentDealer = 3;

    const input: HandResultInput = {
      resultType: 'agari', winnerIndex: 0, loserIndex: 1,
      isTsumo: false, han: 1, fu: 30,
    };
    processHandResult(game, input);
    expect(game.status).toBe('completed');
  });

  it('dealer win in All Last → renchan (game continues)', () => {
    game.currentRound = { wind: 'south', number: 4 };
    game.currentDealer = 3;

    const input: HandResultInput = {
      resultType: 'agari', winnerIndex: 3, loserIndex: 0,
      isTsumo: false, han: 2, fu: 30,
    };
    processHandResult(game, input);
    expect(game.status).toBe('in_progress');
    expect(game.currentRound).toEqual({ wind: 'south', number: 4 });
    expect(game.honbaCount).toBe(1);
  });
});

// ──────────────────────────────────────────────────
// undoLastHand
// ──────────────────────────────────────────────────
describe('undoLastHand', () => {
  it('returns null if no hands', () => {
    const game = createTestGame();
    expect(undoLastHand(game)).toBeNull();
  });

  it('restores points and game state', () => {
    const game = createTestGame();
    const input: HandResultInput = {
      resultType: 'agari', winnerIndex: 1, loserIndex: 0,
      isTsumo: false, han: 3, fu: 30,
    };
    processHandResult(game, input);

    // Verify state changed
    expect(game.players[0].points).not.toBe(25000);
    expect(game.currentDealer).toBe(1);
    expect(game.hands).toHaveLength(1);

    // Undo
    const undone = undoLastHand(game);
    expect(undone).not.toBeNull();
    expect(game.players[0].points).toBe(25000);
    expect(game.players[1].points).toBe(25000);
    expect(game.currentDealer).toBe(0);
    expect(game.currentRound).toEqual({ wind: 'east', number: 1 });
    expect(game.hands).toHaveLength(0);
    expect(game.status).toBe('in_progress');
  });

  it('restores honba and riichi sticks after undo', () => {
    const game = createTestGame();
    game.honbaCount = 2;
    game.riichiSticks = 1;

    processHandResult(game, {
      resultType: 'agari', winnerIndex: 0, loserIndex: 1,
      isTsumo: false, han: 1, fu: 30,
    });
    // After dealer win: honba was 2, now should be 3, riichi sticks collected
    expect(game.honbaCount).toBe(3);
    expect(game.riichiSticks).toBe(0);

    undoLastHand(game);
    expect(game.honbaCount).toBe(2);
    expect(game.riichiSticks).toBe(1);
  });

  it('undoes completed game back to in_progress', () => {
    const game = createTestGame();
    game.currentRound = { wind: 'south', number: 4 };
    game.currentDealer = 3;

    processHandResult(game, {
      resultType: 'agari', winnerIndex: 0, loserIndex: 1,
      isTsumo: false, han: 1, fu: 30,
    });
    expect(game.status).toBe('completed');

    undoLastHand(game);
    expect(game.status).toBe('in_progress');
    expect(game.currentRound).toEqual({ wind: 'south', number: 4 });
  });
});

// ──────────────────────────────────────────────────
// Full Game Simulation
// ──────────────────────────────────────────────────
describe('Full Game Simulation', () => {
  it('plays a complete 8-hand game (no renchan) from East 1 to South 4', () => {
    const game = createTestGame();

    // Play 8 hands: non-dealer wins each time to advance through all rounds
    const expectedRounds = [
      { wind: 'east', number: 1 }, { wind: 'east', number: 2 },
      { wind: 'east', number: 3 }, { wind: 'east', number: 4 },
      { wind: 'south', number: 1 }, { wind: 'south', number: 2 },
      { wind: 'south', number: 3 }, { wind: 'south', number: 4 },
    ];

    for (let i = 0; i < 8; i++) {
      expect(game.status).toBe('in_progress');
      expect(game.currentRound).toEqual(expectedRounds[i]);
      const dealerIdx = i % 4;
      expect(game.currentDealer).toBe(dealerIdx);

      const winnerIdx = (dealerIdx + 1) % 4;
      processHandResult(game, {
        resultType: 'agari', winnerIndex: winnerIdx, loserIndex: dealerIdx,
        isTsumo: false, han: 1, fu: 30,
      });
    }

    // After South 4 non-dealer win, game should be completed
    expect(game.status).toBe('completed');
    expect(game.hands).toHaveLength(8);
  });

  it('plays multiple hands with mixed results and verifies point conservation', () => {
    const game = createTestGame();

    // E1: dealer ron 2han 40fu
    processHandResult(game, {
      resultType: 'agari', winnerIndex: 0, loserIndex: 2,
      isTsumo: false, han: 2, fu: 40,
    });
    // Renchan

    // E1.1: ryuukyoku dealer tenpai
    processHandResult(game, {
      resultType: 'ryuukyoku', tenpaiStatus: [true, false, true, false],
    });
    // Renchan again

    // E1.2: non-dealer tsumo mangan
    processHandResult(game, {
      resultType: 'agari', winnerIndex: 3, isTsumo: true,
      han: 5, fu: 30,
    });
    // Dealer rotation

    // Verify points add up to 100000
    const total = game.players.reduce((s, p) => s + p.points, 0);
    expect(total).toBe(100000);

    // Verify round advanced
    expect(game.currentRound).toEqual({ wind: 'east', number: 2 });
  });
});

// ──────────────────────────────────────────────────
// Tobi (飛び)
// ──────────────────────────────────────────────────
describe('Tobi (飛び)', () => {
  it('game ends immediately when a player goes negative with tobi enabled', () => {
    const game = createTestGame();
    game.ruleset.tobiEnabled = true;

    // Give P1 only 1000 points
    game.players[1].points = 1000;
    game.players[0].points = 25000 + 24000; // compensate

    // P0 ron on P1 for mangan (8000) → P1 goes to -7000
    processHandResult(game, {
      resultType: 'agari', winnerIndex: 0, loserIndex: 1,
      isTsumo: false, han: 5, fu: 30,
    });

    expect(game.players[1].points).toBeLessThan(0);
    expect(game.status).toBe('completed');
  });

  it('game does NOT end when player reaches exactly 0 with tobi enabled', () => {
    const game = createTestGame();
    game.ruleset.tobiEnabled = true;

    // Give P1 exactly 1000 points; P2 (non-dealer) ron for 1han 30fu = 1000
    game.players[1].points = 1000;
    game.players[2].points = 25000 + 24000;

    processHandResult(game, {
      resultType: 'agari', winnerIndex: 2, loserIndex: 1,
      isTsumo: false, han: 1, fu: 30,
    });

    expect(game.players[1].points).toBe(0);
    expect(game.status).toBe('in_progress');
  });

  it('tobi disabled: game continues even when player goes negative', () => {
    const game = createTestGame();
    game.ruleset.tobiEnabled = false;

    game.players[1].points = 1000;
    game.players[0].points = 25000 + 24000;

    processHandResult(game, {
      resultType: 'agari', winnerIndex: 0, loserIndex: 1,
      isTsumo: false, han: 5, fu: 30,
    });

    expect(game.players[1].points).toBeLessThan(0);
    expect(game.status).toBe('in_progress');
  });
});

// ──────────────────────────────────────────────────
// Nagashi Mangan (流局満貫)
// ──────────────────────────────────────────────────
describe('Nagashi Mangan', () => {
  it('non-dealer nagashi mangan: tenpai/noten penalties + mangan tsumo layered', () => {
    const game = createTestGame();
    processHandResult(game, {
      resultType: 'ryuukyoku',
      tenpaiStatus: [false, true, false, false],
      nagashiManganPlayers: [false, true, false, false],
    });

    // Normal draw: P1 tenpai +3000, P0/P2/P3 noten -1000 each
    // Nagashi P1 (non-dealer): P0(dealer) -4000, P2 -2000, P3 -2000, P1 +8000
    // Combined: P0=-5000, P1=+11000, P2=-3000, P3=-3000
    expect(game.players[0].points).toBe(25000 - 5000);
    expect(game.players[1].points).toBe(25000 + 11000);
    expect(game.players[2].points).toBe(25000 - 3000);
    expect(game.players[3].points).toBe(25000 - 3000);

    // Points conserved
    const total = game.players.reduce((s, p) => s + p.points, 0);
    expect(total).toBe(100000);
  });

  it('dealer nagashi mangan: tenpai/noten penalties + mangan tsumo layered', () => {
    const game = createTestGame();
    processHandResult(game, {
      resultType: 'ryuukyoku',
      tenpaiStatus: [true, false, false, false],
      nagashiManganPlayers: [true, false, false, false],
    });

    // Normal draw: P0 tenpai +3000, P1/P2/P3 noten -1000 each
    // Nagashi P0 (dealer): P1 -4000, P2 -4000, P3 -4000, P0 +12000
    // Combined: P0=+15000, P1=-5000, P2=-5000, P3=-5000
    expect(game.players[0].points).toBe(25000 + 15000);
    expect(game.players[1].points).toBe(25000 - 5000);
    expect(game.players[2].points).toBe(25000 - 5000);
    expect(game.players[3].points).toBe(25000 - 5000);
  });

  it('nagashi mangan counts as ryuukyoku for state transition (dealer tenpai = renchan)', () => {
    const game = createTestGame();
    processHandResult(game, {
      resultType: 'ryuukyoku',
      tenpaiStatus: [true, true, false, false],
      nagashiManganPlayers: [false, true, false, false],
    });

    // Dealer (P0) is tenpai → renchan (nagashi does not affect this)
    expect(game.currentRound).toEqual({ wind: 'east', number: 1 });
    expect(game.currentDealer).toBe(0);
    expect(game.honbaCount).toBe(1);
  });

  it('multiple players nagashi mangan: both payments layered on tenpai/noten', () => {
    const game = createTestGame();
    processHandResult(game, {
      resultType: 'ryuukyoku',
      tenpaiStatus: [true, true, false, false],
      nagashiManganPlayers: [true, true, false, false],
    });

    // Normal draw: 2 tenpai (P0, P1) +1500 each, 2 noten (P2, P3) -1500 each
    // Nagashi P0 (dealer): P1 -4000, P2 -4000, P3 -4000, P0 +12000
    // Nagashi P1 (non-dealer): P0(dealer) -4000, P2 -2000, P3 -2000, P1 +8000
    // Combined: P0=+1500+12000-4000=+9500, P1=+1500+8000-4000=+5500, P2=-1500-4000-2000=-7500, P3=-1500-4000-2000=-7500
    expect(game.players[0].points).toBe(25000 + 9500);
    expect(game.players[1].points).toBe(25000 + 5500);
    expect(game.players[2].points).toBe(25000 - 7500);
    expect(game.players[3].points).toBe(25000 - 7500);

    const total = game.players.reduce((s, p) => s + p.points, 0);
    expect(total).toBe(100000);
  });

  it('dealer nagashi mangan but not tenpai: dealer does NOT renchan', () => {
    const game = createTestGame();
    processHandResult(game, {
      resultType: 'ryuukyoku',
      tenpaiStatus: [false, true, false, false],
      nagashiManganPlayers: [true, false, false, false],
    });

    // Dealer not tenpai → rotate dealer
    expect(game.currentDealer).toBe(1);
    expect(game.currentRound).toEqual({ wind: 'east', number: 2 });
  });
});

// ──────────────────────────────────────────────────
// Custom Score Formula
// ──────────────────────────────────────────────────
describe('Custom Score Formula', () => {
  it('evaluateScoreFormula evaluates basic expression', () => {
    expect(evaluateScoreFormula('(X - 30000) / 1000 + Y', 35000, 30)).toBe(35);
    expect(evaluateScoreFormula('(X - 30000) / 1000 + Y', 20000, -30)).toBe(-40);
  });

  it('evaluateScoreFormula handles simple X + Y formula', () => {
    expect(evaluateScoreFormula('X + Y', 25000, 10)).toBe(25010);
  });

  it('evaluateScoreFormula falls back on invalid formula', () => {
    const result = evaluateScoreFormula('invalid!!!', 30000, 10);
    expect(typeof result).toBe('number');
    expect(isFinite(result)).toBe(true);
  });

  it('calculateFinalScores uses custom formula', () => {
    const players: GamePlayer[] = [
      { id: 'p0', name: 'A', points: 35000, initialSeat: 'east' },
      { id: 'p1', name: 'B', points: 28000, initialSeat: 'south' },
      { id: 'p2', name: 'C', points: 22000, initialSeat: 'west' },
      { id: 'p3', name: 'D', points: 15000, initialSeat: 'north' },
    ];
    const ruleset = {
      ...M_LEAGUE_RULES,
      scoreFormula: '(X - 30000) / 1000 + Y',
      okaEnabled: false,
    };

    const scores = calculateFinalScores(players, 0, ruleset);
    // 1st: (35000-30000)/1000 + 30 = 35
    // 2nd: (28000-30000)/1000 + 10 = 8
    // 3rd: (22000-30000)/1000 + -10 = -18
    // 4th: (15000-30000)/1000 + -30 = -45
    expect(scores[0].gameScore).toBe(35);
    expect(scores[1].gameScore).toBe(8);
    expect(scores[2].gameScore).toBe(-18);
    expect(scores[3].gameScore).toBe(-45);
  });

  it('calculateFinalScores with oka enabled adds bonus to 1st', () => {
    const players: GamePlayer[] = [
      { id: 'p0', name: 'A', points: 35000, initialSeat: 'east' },
      { id: 'p1', name: 'B', points: 28000, initialSeat: 'south' },
      { id: 'p2', name: 'C', points: 22000, initialSeat: 'west' },
      { id: 'p3', name: 'D', points: 15000, initialSeat: 'north' },
    ];
    const ruleset = {
      ...M_LEAGUE_RULES,
      scoreFormula: '(X - 30000) / 1000 + Y',
      okaEnabled: true,
    };

    const scores = calculateFinalScores(players, 0, ruleset);
    // 1st gets +20 oka: (35000-30000)/1000 + 30 + 20 = 55
    expect(scores[0].gameScore).toBe(55);
    // Others unchanged
    expect(scores[1].gameScore).toBe(8);
  });

  it('custom starting points game works end-to-end', () => {
    const game = createTestGame();
    game.ruleset.startingPoints = 30000;
    game.ruleset.returnPoints = 35000;
    for (const p of game.players) p.points = 30000;

    processHandResult(game, {
      resultType: 'agari', winnerIndex: 1, loserIndex: 0,
      isTsumo: false, han: 3, fu: 30,
    });

    // Points conserved at 120000
    const total = game.players.reduce((s, p) => s + p.points, 0);
    expect(total).toBe(120000);
  });
});

// ──────────────────────────────────────────────────
// Riichi Deposits (立直)
// ──────────────────────────────────────────────────
describe('Riichi Deposits', () => {
  let game: Game;
  beforeEach(() => { game = createTestGame(); });

  it('deducts 1000 per riichi player and increments riichiSticks', () => {
    const hand = processHandResult(game, {
      resultType: 'agari', winnerIndex: 1, loserIndex: 0,
      isTsumo: false, han: 1, fu: 30,
      riichiPlayers: [true, false, false, false],
    });

    // pointsBefore is pre-riichi state
    expect(hand.pointsBefore[0]).toBe(25000);
    // riichiSticksOnTable includes the deposit
    expect(hand.riichiSticksOnTable).toBe(1);
    // riichiPlayers stored on hand
    expect(hand.riichiPlayers).toEqual([true, false, false, false]);
    // Winner collects the riichi stick
    expect(hand.result.type === 'agari' && hand.result.riichiSticksCollected).toBe(1);
  });

  it('multiple riichi players: all deposits applied', () => {
    const hand = processHandResult(game, {
      resultType: 'ryuukyoku',
      tenpaiStatus: [true, false, false, true],
      riichiPlayers: [true, false, true, false],
    });
    expect(hand.riichiSticksOnTable).toBe(2);
    expect(game.riichiSticks).toBe(2); // not collected on ryuukyoku
  });

  it('undo reverses riichi deposits correctly', () => {
    processHandResult(game, {
      resultType: 'agari', winnerIndex: 0, loserIndex: 1,
      isTsumo: false, han: 1, fu: 30,
      riichiPlayers: [false, true, false, false],
    });
    // After agari, riichi sticks collected (= 0)
    expect(game.riichiSticks).toBe(0);

    undoLastHand(game);
    // Should restore to pre-deposit state (0 sticks)
    expect(game.riichiSticks).toBe(0);
    expect(game.players[1].points).toBe(25000); // fully restored
  });

  it('undo with pre-existing riichi sticks restores correctly', () => {
    game.riichiSticks = 2;
    processHandResult(game, {
      resultType: 'ryuukyoku',
      tenpaiStatus: [true, false, false, false],
      riichiPlayers: [false, false, true, false],
    });
    // riichiSticks = 2 (existing) + 1 (new deposit) = 3
    expect(game.riichiSticks).toBe(3);

    undoLastHand(game);
    expect(game.riichiSticks).toBe(2); // restored to pre-deposit
  });

  it('no riichiPlayers field defaults to no deposits', () => {
    const hand = processHandResult(game, {
      resultType: 'agari', winnerIndex: 1, loserIndex: 0,
      isTsumo: false, han: 1, fu: 30,
    });
    expect(hand.riichiPlayers).toEqual([false, false, false, false]);
    expect(hand.riichiSticksOnTable).toBe(0);
  });

  it('point conservation with riichi deposits', () => {
    processHandResult(game, {
      resultType: 'agari', winnerIndex: 2, loserIndex: 0,
      isTsumo: false, han: 3, fu: 30,
      riichiPlayers: [true, true, false, false],
    });
    const total = game.players.reduce((s, p) => s + p.points, 0);
    expect(total).toBe(100000);
  });

  it('all four players riichi works correctly', () => {
    const hand = processHandResult(game, {
      resultType: 'agari', winnerIndex: 0, loserIndex: 1,
      isTsumo: false, han: 1, fu: 30,
      riichiPlayers: [true, true, true, true],
    });
    expect(hand.riichiSticksOnTable).toBe(4);
    expect(hand.result.type === 'agari' && hand.result.riichiSticksCollected).toBe(4);
    // Winner collects all 4 sticks (+4000)
    const total = game.players.reduce((s, p) => s + p.points, 0);
    expect(total).toBe(100000);
  });
});
