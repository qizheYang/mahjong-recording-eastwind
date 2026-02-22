import { describe, it, expect, beforeEach } from 'vitest';
import {
  processHandResult, undoLastHand, editHand, determineNextState, isAllLastHand,
  M_LEAGUE_RULES, PRESET_RULESETS, OFFICIAL_MATCH_RULES, WRC_RULES, SAIKOUISEN_RULES,
  calculateFinalScores, evaluateScoreFormula,
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
  it('non-dealer nagashi mangan: replaces tenpai/noten penalties', () => {
    const game = createTestGame();
    processHandResult(game, {
      resultType: 'ryuukyoku',
      tenpaiStatus: [false, true, false, false],
      nagashiManganPlayers: [false, true, false, false],
    });

    // Nagashi replaces tenpai/noten entirely
    // P1 (non-dealer) nagashi: P0(dealer) -4000, P2 -2000, P3 -2000, P1 +8000
    expect(game.players[0].points).toBe(25000 - 4000);
    expect(game.players[1].points).toBe(25000 + 8000);
    expect(game.players[2].points).toBe(25000 - 2000);
    expect(game.players[3].points).toBe(25000 - 2000);

    // Points conserved
    const total = game.players.reduce((s, p) => s + p.points, 0);
    expect(total).toBe(100000);
  });

  it('dealer nagashi mangan: replaces tenpai/noten penalties', () => {
    const game = createTestGame();
    processHandResult(game, {
      resultType: 'ryuukyoku',
      tenpaiStatus: [true, false, false, false],
      nagashiManganPlayers: [true, false, false, false],
    });

    // Nagashi replaces tenpai/noten entirely
    // P0 (dealer) nagashi: P1 -4000, P2 -4000, P3 -4000, P0 +12000
    expect(game.players[0].points).toBe(25000 + 12000);
    expect(game.players[1].points).toBe(25000 - 4000);
    expect(game.players[2].points).toBe(25000 - 4000);
    expect(game.players[3].points).toBe(25000 - 4000);
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

  it('multiple players nagashi mangan: both payments, no tenpai/noten', () => {
    const game = createTestGame();
    processHandResult(game, {
      resultType: 'ryuukyoku',
      tenpaiStatus: [true, true, false, false],
      nagashiManganPlayers: [true, true, false, false],
    });

    // Nagashi replaces tenpai/noten entirely
    // P0 (dealer) nagashi: P1 -4000, P2 -4000, P3 -4000, P0 +12000
    // P1 (non-dealer) nagashi: P0(dealer) -4000, P2 -2000, P3 -2000, P1 +8000
    // Combined: P0=+12000-4000=+8000, P1=-4000+8000=+4000, P2=-4000-2000=-6000, P3=-4000-2000=-6000
    expect(game.players[0].points).toBe(25000 + 8000);
    expect(game.players[1].points).toBe(25000 + 4000);
    expect(game.players[2].points).toBe(25000 - 6000);
    expect(game.players[3].points).toBe(25000 - 6000);

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

// ──────────────────────────────────────────────────
// editHand
// ──────────────────────────────────────────────────
describe('editHand', () => {
  it('edits a hand and recalculates subsequent hands', () => {
    const game = createTestGame();

    // Record 2 hands
    // Hand 1: p1 rons p0 (dealer), 3han/30fu = 4000 pts
    processHandResult(game, {
      resultType: 'agari', winnerIndex: 1, loserIndex: 0,
      isTsumo: false, han: 3, fu: 30,
    });
    // Hand 2: p2 rons p1, 2han/30fu = 2000 pts (dealer is now p1)
    processHandResult(game, {
      resultType: 'agari', winnerIndex: 2, loserIndex: 1,
      isTsumo: false, han: 2, fu: 30,
    });

    expect(game.hands.length).toBe(2);

    // Edit hand 1: change to 4han/30fu (kiriage mangan → 8000)
    const success = editHand(game, 1, {
      resultType: 'agari', winnerIndex: 1, loserIndex: 0,
      isTsumo: false, han: 4, fu: 30,
    });

    expect(success).toBe(true);
    expect(game.hands.length).toBe(2);
    // With kiriage mangan (M_LEAGUE): 4han/30fu → mangan 8000
    // Hand 1: p0 loses 8000, p1 gains 8000
    // Hand 2: p2 rons p1, 2han/30fu = 2000
    // p0: 25000 - 8000 = 17000
    // p1: 25000 + 8000 - 2000 = 31000
    // p2: 25000 + 2000 = 27000
    // p3: 25000
    expect(game.players[0].points).toBe(17000);
    expect(game.players[1].points).toBe(31000);
    expect(game.players[2].points).toBe(27000);
    expect(game.players[3].points).toBe(25000);
  });

  it('returns false for invalid hand number', () => {
    const game = createTestGame();
    processHandResult(game, {
      resultType: 'agari', winnerIndex: 1, loserIndex: 0,
      isTsumo: false, han: 3, fu: 30,
    });

    expect(editHand(game, 99, {
      resultType: 'agari', winnerIndex: 1, loserIndex: 0,
      isTsumo: false, han: 2, fu: 30,
    })).toBe(false);
  });

  it('preserves game state consistency after editing middle hand', () => {
    const game = createTestGame();

    // Record 3 hands
    processHandResult(game, {
      resultType: 'agari', winnerIndex: 1, loserIndex: 0,
      isTsumo: false, han: 1, fu: 30,
    });
    processHandResult(game, {
      resultType: 'agari', winnerIndex: 2, loserIndex: 1,
      isTsumo: false, han: 1, fu: 30,
    });
    processHandResult(game, {
      resultType: 'agari', winnerIndex: 3, loserIndex: 2,
      isTsumo: false, han: 1, fu: 30,
    });

    expect(game.hands.length).toBe(3);

    // Edit hand 2: change to tsumo
    editHand(game, 2, {
      resultType: 'agari', winnerIndex: 0,
      isTsumo: true, han: 2, fu: 30,
    });

    expect(game.hands.length).toBe(3);
    // All hands should have inputs stored
    game.hands.forEach(h => expect(h.input).toBeDefined());
    // Total points should still sum to 100000
    const total = game.players.reduce((s, p) => s + p.points, 0);
    expect(total).toBe(100000);
  });
});

// ──────────────────────────────────────────────────
// Multi-Ron (Double/Triple Ron)
// ──────────────────────────────────────────────────
describe('Multi-Ron', () => {
  function createDoubleRonGame(): Game {
    return {
      ...createTestGame(),
      ruleset: { ...M_LEAGUE_RULES, doubleRonEnabled: true },
    };
  }

  it('double ron: both winners get paid from loser', () => {
    const game = createDoubleRonGame();
    // p1 and p2 ron p0 (dealer), both 3han/30fu
    // p1: non-dealer ron from dealer = 4000, p2: non-dealer ron from dealer = 4000
    // Each gets +300 honba bonus (0 honba → 0)
    processHandResult(game, {
      resultType: 'agari',
      multiRon: {
        loserIndex: 0,
        winners: [
          { winnerIndex: 1, han: 3, fu: 30 },
          { winnerIndex: 2, han: 3, fu: 30 },
        ],
      },
    });

    expect(game.hands.length).toBe(1);
    const hand = game.hands[0];
    expect(hand.result.type).toBe('multi_agari');
    // 3han/30fu non-dealer ron = 3900
    // p0 pays 3900 to p1 and 3900 to p2 = -7800
    expect(game.players[0].points).toBe(25000 - 7800); // 17200
    expect(game.players[1].points).toBe(25000 + 3900); // 28900
    expect(game.players[2].points).toBe(25000 + 3900); // 28900
    expect(game.players[3].points).toBe(25000);
    // Total conserved
    expect(game.players.reduce((s, p) => s + p.points, 0)).toBe(100000);
  });

  it('riichi sticks go to closest winner in turn order', () => {
    const game = createDoubleRonGame();
    // Manually set riichi sticks
    game.riichiSticks = 2;

    // p3 and p1 ron p0 (dealer)
    // Closest to p0 in turn order: p1 (shimocha), then p2, then p3
    // So p1 gets the riichi sticks
    processHandResult(game, {
      resultType: 'agari',
      multiRon: {
        loserIndex: 0,
        winners: [
          { winnerIndex: 3, han: 1, fu: 30 },
          { winnerIndex: 1, han: 1, fu: 30 },
        ],
      },
    });

    // p1 should get the 2 riichi sticks (2000 pts)
    // 1han/30fu non-dealer ron from dealer = 1000
    // p0: -1000 -1000 = -2000
    // p1: +1000 + 2000 riichi = +3000
    // p3: +1000
    expect(game.players[1].points).toBe(25000 + 1000 + 2000); // 28000
    expect(game.players[3].points).toBe(25000 + 1000); // 26000
  });

  it('dealer in multi-ron → renchan', () => {
    const game = createDoubleRonGame();
    // p0 (dealer) and p2 ron p1
    processHandResult(game, {
      resultType: 'agari',
      multiRon: {
        loserIndex: 1,
        winners: [
          { winnerIndex: 0, han: 1, fu: 30 },
          { winnerIndex: 2, han: 1, fu: 30 },
        ],
      },
    });

    // Dealer won → renchan, still East 1
    expect(game.currentRound).toEqual({ wind: 'east', number: 1 });
    expect(game.currentDealer).toBe(0);
    expect(game.honbaCount).toBe(1);
  });

  it('non-dealer multi-ron (no dealer) → rotate', () => {
    const game = createDoubleRonGame();
    // p1 and p2 ron p3 (no dealer involved as winner)
    processHandResult(game, {
      resultType: 'agari',
      multiRon: {
        loserIndex: 3,
        winners: [
          { winnerIndex: 1, han: 1, fu: 30 },
          { winnerIndex: 2, han: 1, fu: 30 },
        ],
      },
    });

    // No dealer win → rotate
    expect(game.currentRound).toEqual({ wind: 'east', number: 2 });
    expect(game.currentDealer).toBe(1);
  });

  it('multi-ron with honba bonus', () => {
    const game = createDoubleRonGame();
    game.honbaCount = 2;

    processHandResult(game, {
      resultType: 'agari',
      multiRon: {
        loserIndex: 0,
        winners: [
          { winnerIndex: 1, han: 1, fu: 30 },
          { winnerIndex: 2, han: 1, fu: 30 },
        ],
      },
    });

    // Each winner gets 1000 (base) + 600 (2 honba * 300) = 1600 from loser
    // Loser pays 1600 * 2 = 3200
    expect(game.players[0].points).toBe(25000 - 3200);
    expect(game.players[1].points).toBe(25000 + 1600);
    expect(game.players[2].points).toBe(25000 + 1600);
  });

  it('undo reverses multi-ron correctly', () => {
    const game = createDoubleRonGame();
    processHandResult(game, {
      resultType: 'agari',
      multiRon: {
        loserIndex: 0,
        winners: [
          { winnerIndex: 1, han: 3, fu: 30 },
          { winnerIndex: 2, han: 2, fu: 30 },
        ],
      },
    });

    undoLastHand(game);

    expect(game.hands.length).toBe(0);
    expect(game.players.every(p => p.points === 25000)).toBe(true);
    expect(game.currentRound).toEqual({ wind: 'east', number: 1 });
  });
});

// ──────────────────────────────────────────────────
// Yakuman through state machine
// ──────────────────────────────────────────────────
describe('Yakuman in game state', () => {
  it('single yakuman with yakumanList stores data on result', () => {
    const game = createTestGame();
    game.ruleset = { ...M_LEAGUE_RULES, doubleYakumanEnabled: true };
    processHandResult(game, {
      resultType: 'agari',
      winnerIndex: 0,
      isTsumo: true,
      han: 13,
      fu: 30,
      yakumanList: ['suuankou'],
    });

    const result = game.hands[0].result;
    expect(result.type).toBe('agari');
    if (result.type === 'agari') {
      expect(result.yakumanList).toEqual(['suuankou']);
      expect(result.yakumanCount).toBe(1);
      // Single yakuman dealer tsumo: each pays 16000
      expect(result.pointsWon).toBe(48000);
    }
  });

  it('double yakuman with doubleYakumanEnabled scores 2x', () => {
    const game = createTestGame();
    game.ruleset = { ...M_LEAGUE_RULES, doubleYakumanEnabled: true };
    // Non-dealer (player 1) ron from player 0
    processHandResult(game, {
      resultType: 'agari',
      winnerIndex: 1,
      loserIndex: 0,
      isTsumo: false,
      han: 13,
      fu: 30,
      yakumanList: ['suuankou_tanki'], // double yakuman
    });

    const result = game.hands[0].result;
    if (result.type === 'agari') {
      expect(result.yakumanCount).toBe(2);
      expect(result.pointsWon).toBe(64000); // double yakuman non-dealer ron
      // Check loser lost 64000
      expect(game.players[0].points).toBe(25000 - 64000);
      expect(game.players[1].points).toBe(25000 + 64000);
    }
  });

  it('double yakuman with doubleYakumanEnabled=false scores 1x', () => {
    const game = createTestGame();
    game.ruleset = { ...M_LEAGUE_RULES, doubleYakumanEnabled: false };
    processHandResult(game, {
      resultType: 'agari',
      winnerIndex: 1,
      loserIndex: 0,
      isTsumo: false,
      han: 13,
      fu: 30,
      yakumanList: ['suuankou_tanki'],
    });

    const result = game.hands[0].result;
    if (result.type === 'agari') {
      expect(result.yakumanCount).toBe(1);
      expect(result.pointsWon).toBe(32000); // single yakuman
    }
  });

  it('stacked yakuman (tsuiisou + daisuushii) with doubleYakuman enabled = triple', () => {
    const game = createTestGame();
    game.ruleset = { ...M_LEAGUE_RULES, doubleYakumanEnabled: true };
    processHandResult(game, {
      resultType: 'agari',
      winnerIndex: 1,
      loserIndex: 0,
      isTsumo: false,
      han: 13,
      fu: 30,
      yakumanList: ['tsuiisou', 'daisuushii'], // 1 + 2 = 3x
    });

    const result = game.hands[0].result;
    if (result.type === 'agari') {
      expect(result.yakumanCount).toBe(3);
      expect(result.pointsWon).toBe(96000); // triple yakuman non-dealer ron
    }
  });

  it('yakuman in multi-ron: each winner has independent yakumanList', () => {
    const game = createTestGame();
    game.ruleset = { ...M_LEAGUE_RULES, doubleRonEnabled: true, doubleYakumanEnabled: true };
    processHandResult(game, {
      resultType: 'agari',
      multiRon: {
        loserIndex: 0,
        winners: [
          { winnerIndex: 1, han: 13, fu: 30, yakumanList: ['kokushi'] },
          { winnerIndex: 2, han: 13, fu: 30, yakumanList: ['suuankou_tanki'] },
        ],
      },
    });

    const result = game.hands[0].result;
    expect(result.type).toBe('multi_agari');
    if (result.type === 'multi_agari') {
      expect(result.winners[0].yakumanList).toEqual(['kokushi']);
      expect(result.winners[0].yakumanCount).toBe(1);
      expect(result.winners[0].pointsWon).toBe(32000);
      expect(result.winners[1].yakumanList).toEqual(['suuankou_tanki']);
      expect(result.winners[1].yakumanCount).toBe(2); // double yakuman
      expect(result.winners[1].pointsWon).toBe(64000);
    }
  });
});

// ──────────────────────────────────────────────────
// Preset Rulesets
// ──────────────────────────────────────────────────
describe('Preset Rulesets', () => {
  it('M-League rules have correct defaults', () => {
    expect(M_LEAGUE_RULES.startingPoints).toBe(25000);
    expect(M_LEAGUE_RULES.returnPoints).toBe(30000);
    expect(M_LEAGUE_RULES.uma).toEqual([30, 10, -10, -30]);
    expect(M_LEAGUE_RULES.tobiEnabled).toBe(false);
    expect(M_LEAGUE_RULES.okaEnabled).toBe(true);
    expect(M_LEAGUE_RULES.kiriageMangan).toBe(true);
    expect(M_LEAGUE_RULES.doubleRonEnabled).toBe(false);
    expect(M_LEAGUE_RULES.countedYakumanEnabled).toBe(false);
    expect(M_LEAGUE_RULES.doubleYakumanEnabled).toBe(false);
    expect(M_LEAGUE_RULES.nagashiManganEnabled).toBe(true);
  });

  it('preset rulesets are all valid complete rulesets', () => {
    const requiredKeys = [
      'startingPoints', 'returnPoints', 'uma', 'tobiEnabled',
      'scoreFormula', 'okaEnabled', 'enchousenEnabled', 'doubleRonEnabled',
      'countedYakumanEnabled', 'doubleYakumanEnabled', 'kiriageMangan',
      'nagashiManganEnabled', 'akadoraCount',
    ];
    for (const [, ruleset] of Object.entries(PRESET_RULESETS)) {
      for (const key of requiredKeys) {
        expect((ruleset as any)[key]).toBeDefined();
      }
    }
  });

  it('Official rules differ from M-League: tobi and double ron enabled', () => {
    expect(OFFICIAL_MATCH_RULES.tobiEnabled).toBe(true);
    expect(OFFICIAL_MATCH_RULES.doubleRonEnabled).toBe(true);
    expect(OFFICIAL_MATCH_RULES.startingPoints).toBe(25000); // inherited
  });

  it('WRC rules have correct settings', () => {
    expect(WRC_RULES.startingPoints).toBe(30000);
    expect(WRC_RULES.returnPoints).toBe(30000);
    expect(WRC_RULES.uma).toEqual([15, 5, -5, -15]);
    expect(WRC_RULES.tobiEnabled).toBe(true);
    expect(WRC_RULES.doubleRonEnabled).toBe(true);
    expect(WRC_RULES.countedYakumanEnabled).toBe(true);
    expect(WRC_RULES.akadoraCount).toBe(0);
  });

  it('Saikouisen rules: no tobi, no nagashi, no double ron', () => {
    expect(SAIKOUISEN_RULES.startingPoints).toBe(30000);
    expect(SAIKOUISEN_RULES.tobiEnabled).toBe(false);
    expect(SAIKOUISEN_RULES.nagashiManganEnabled).toBe(false);
    expect(SAIKOUISEN_RULES.doubleRonEnabled).toBe(false);
    expect(SAIKOUISEN_RULES.okaEnabled).toBe(false);
  });

  it('game with WRC preset starts at 30000 points', () => {
    const game: Game = {
      ...createTestGame(),
      ruleset: { ...WRC_RULES },
    };
    for (const p of game.players) p.points = 30000;

    processHandResult(game, {
      resultType: 'agari', winnerIndex: 1, loserIndex: 0,
      isTsumo: false, han: 3, fu: 30,
    });

    const total = game.players.reduce((s, p) => s + p.points, 0);
    expect(total).toBe(120000); // 4 * 30000
  });
});

// ──────────────────────────────────────────────────
// Honba accumulation edge cases
// ──────────────────────────────────────────────────
describe('Honba accumulation', () => {
  it('consecutive draws accumulate honba', () => {
    const game = createTestGame();
    // 3 consecutive draws with dealer tenpai
    for (let i = 0; i < 3; i++) {
      processHandResult(game, {
        resultType: 'ryuukyoku',
        tenpaiStatus: [true, false, false, false],
      });
    }
    expect(game.honbaCount).toBe(3);
    expect(game.currentRound).toEqual({ wind: 'east', number: 1 });
    expect(game.currentDealer).toBe(0);
  });

  it('draw with dealer noten: honba carries to next dealer', () => {
    const game = createTestGame();
    // Draw, dealer noten → rotate, honba carries
    processHandResult(game, {
      resultType: 'ryuukyoku',
      tenpaiStatus: [false, true, false, false],
    });
    expect(game.honbaCount).toBe(1);
    expect(game.currentDealer).toBe(1);

    // Another draw, new dealer (p1) tenpai → renchan, honba++
    processHandResult(game, {
      resultType: 'ryuukyoku',
      tenpaiStatus: [false, true, false, false],
    });
    expect(game.honbaCount).toBe(2);
    expect(game.currentDealer).toBe(1);
  });

  it('non-dealer win resets honba to 0', () => {
    const game = createTestGame();
    game.honbaCount = 5;
    processHandResult(game, {
      resultType: 'agari', winnerIndex: 1, loserIndex: 2,
      isTsumo: false, han: 1, fu: 30,
    });
    expect(game.honbaCount).toBe(0);
  });

  it('honba bonus applied correctly in ron after multiple draws', () => {
    const game = createTestGame();
    game.honbaCount = 3;

    processHandResult(game, {
      resultType: 'agari', winnerIndex: 2, loserIndex: 3,
      isTsumo: false, han: 1, fu: 30,
    });

    // 1han 30fu non-dealer ron = 1000 + 3*300 honba = 1900
    expect(game.players[2].points).toBe(25000 + 1900);
    expect(game.players[3].points).toBe(25000 - 1900);
  });
});

// ──────────────────────────────────────────────────
// Edit hand edge cases
// ──────────────────────────────────────────────────
describe('Edit hand edge cases', () => {
  it('edit hand with riichi: riichi deposits recalculated', () => {
    const game = createTestGame();

    // Record hand 1 with riichi
    processHandResult(game, {
      resultType: 'agari', winnerIndex: 1, loserIndex: 0,
      isTsumo: false, han: 1, fu: 30,
      riichiPlayers: [true, false, false, false],
    });

    // Record hand 2
    processHandResult(game, {
      resultType: 'agari', winnerIndex: 0, loserIndex: 1,
      isTsumo: false, han: 2, fu: 30,
    });

    // Edit hand 1: remove riichi, change to 2han
    editHand(game, 1, {
      resultType: 'agari', winnerIndex: 1, loserIndex: 0,
      isTsumo: false, han: 2, fu: 30,
    });

    // Points should still be conserved
    const total = game.players.reduce((s, p) => s + p.points, 0);
    expect(total).toBe(100000);
    expect(game.hands.length).toBe(2);
  });

  it('edit hand that changes game outcome (agari to ryuukyoku)', () => {
    const game = createTestGame();

    // Record 2 hands
    processHandResult(game, {
      resultType: 'agari', winnerIndex: 1, loserIndex: 0,
      isTsumo: false, han: 3, fu: 30,
    });
    processHandResult(game, {
      resultType: 'agari', winnerIndex: 2, loserIndex: 1,
      isTsumo: false, han: 1, fu: 30,
    });

    // Edit hand 1: change to ryuukyoku
    editHand(game, 1, {
      resultType: 'ryuukyoku',
      tenpaiStatus: [true, false, false, false],
    });

    // Hand 1 is now ryuukyoku, dealer tenpai → renchan
    // Hand 2 replayed with different state
    expect(game.hands.length).toBe(2);
    const total = game.players.reduce((s, p) => s + p.points, 0);
    expect(total).toBe(100000);
  });

  it('edit causes game to end early (tobi scenario)', () => {
    const game = createTestGame();
    game.ruleset = { ...M_LEAGUE_RULES, tobiEnabled: true };
    game.players[0].points = 5000;
    game.players[1].points = 45000;

    // Record 2 hands
    processHandResult(game, {
      resultType: 'agari', winnerIndex: 1, loserIndex: 2,
      isTsumo: false, han: 1, fu: 30,
    });
    processHandResult(game, {
      resultType: 'agari', winnerIndex: 2, loserIndex: 3,
      isTsumo: false, han: 1, fu: 30,
    });

    expect(game.hands.length).toBe(2);

    // Edit hand 1: make p1 ron from p0 for mangan → p0 goes negative
    editHand(game, 1, {
      resultType: 'agari', winnerIndex: 1, loserIndex: 0,
      isTsumo: false, han: 5, fu: 30,
    });

    // p0 had 5000, loses 8000 → -3000 → tobi → game ends
    expect(game.status).toBe('completed');
    // Hand 2 should not have been replayed because game ended
    expect(game.hands.length).toBe(1);
  });
});

// ──────────────────────────────────────────────────
// All Last edge cases
// ──────────────────────────────────────────────────
describe('All Last edge cases', () => {
  function createAllLastGame(): Game {
    const game = createTestGame();
    game.currentRound = { wind: 'south', number: 4 };
    game.currentDealer = 3;
    return game;
  }

  it('all last: ryuukyoku all noten → end game, riichi sticks distributed', () => {
    const game = createAllLastGame();
    game.riichiSticks = 2;

    processHandResult(game, {
      resultType: 'ryuukyoku',
      tenpaiStatus: [false, false, false, false],
    });

    expect(game.status).toBe('completed');
  });

  it('all last: dealer renchan continues indefinitely', () => {
    const game = createAllLastGame();

    // Dealer wins 3 times in all last
    for (let i = 0; i < 3; i++) {
      processHandResult(game, {
        resultType: 'agari', winnerIndex: 3, loserIndex: 0,
        isTsumo: false, han: 1, fu: 30,
      });
      expect(game.status).toBe('in_progress');
      expect(game.honbaCount).toBe(i + 1);
    }

    // Non-dealer finally wins → game ends
    processHandResult(game, {
      resultType: 'agari', winnerIndex: 0, loserIndex: 1,
      isTsumo: false, han: 1, fu: 30,
    });
    expect(game.status).toBe('completed');
  });

  it('all last: nagashi mangan with dealer tenpai → renchan', () => {
    const game = createAllLastGame();

    processHandResult(game, {
      resultType: 'ryuukyoku',
      tenpaiStatus: [false, false, false, true], // dealer tenpai
      nagashiManganPlayers: [true, false, false, false], // p0 has nagashi
    });

    // Dealer is tenpai → renchan (game continues)
    expect(game.status).toBe('in_progress');
    expect(game.honbaCount).toBe(1);
  });

  it('all last: nagashi mangan with dealer noten → game ends', () => {
    const game = createAllLastGame();

    processHandResult(game, {
      resultType: 'ryuukyoku',
      tenpaiStatus: [true, false, false, false], // dealer not tenpai
      nagashiManganPlayers: [true, false, false, false],
    });

    expect(game.status).toBe('completed');
  });

  it('all last multi-ron: dealer among winners → renchan', () => {
    const game = createAllLastGame();
    game.ruleset = { ...M_LEAGUE_RULES, doubleRonEnabled: true };

    processHandResult(game, {
      resultType: 'agari',
      multiRon: {
        loserIndex: 1,
        winners: [
          { winnerIndex: 3, han: 1, fu: 30 }, // dealer
          { winnerIndex: 0, han: 1, fu: 30 },
        ],
      },
    });

    expect(game.status).toBe('in_progress');
    expect(game.honbaCount).toBe(1);
  });

  it('all last multi-ron: dealer not winner → game ends', () => {
    const game = createAllLastGame();
    game.ruleset = { ...M_LEAGUE_RULES, doubleRonEnabled: true };

    processHandResult(game, {
      resultType: 'agari',
      multiRon: {
        loserIndex: 3, // dealer is loser
        winners: [
          { winnerIndex: 0, han: 1, fu: 30 },
          { winnerIndex: 1, han: 1, fu: 30 },
        ],
      },
    });

    expect(game.status).toBe('completed');
  });
});

// ──────────────────────────────────────────────────
// Multi-ron tobi edge case
// ──────────────────────────────────────────────────
describe('Multi-ron tobi', () => {
  it('tobi during multi-ron: loser goes negative, game ends', () => {
    const game = createTestGame();
    game.ruleset = { ...M_LEAGUE_RULES, doubleRonEnabled: true, tobiEnabled: true };
    game.players[0].points = 5000;
    game.players[1].points = 40000;

    // p1 and p2 ron p0 for mangan each → p0 goes deeply negative
    processHandResult(game, {
      resultType: 'agari',
      multiRon: {
        loserIndex: 0,
        winners: [
          { winnerIndex: 1, han: 5, fu: 30 },
          { winnerIndex: 2, han: 5, fu: 30 },
        ],
      },
    });

    expect(game.players[0].points).toBeLessThan(0);
    expect(game.status).toBe('completed');
  });
});
