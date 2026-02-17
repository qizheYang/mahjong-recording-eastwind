import type { Game, Hand, HandResult, AgariResult, RyuukyokuResult, Round } from '../types/game.js';
import type { HandResultInput } from '../types/ws-events.js';
import { calculateTransfers } from '../scoring/transfers.js';
import { calculatePoints } from '../scoring/calculator.js';

export type GameStateAction =
  | { type: 'renchan'; incrementHonba: boolean }
  | { type: 'rotate_dealer'; resetHonba: boolean }
  | { type: 'end_game'; distributeRiichiSticks: boolean };

/**
 * Determine the next game state transition after a hand result.
 */
export function determineNextState(
  game: Game,
  handResult: HandResult,
): GameStateAction {
  const dealerIndex = game.currentDealer;
  const isAllLast = isAllLastHand(game);

  if (handResult.type === 'agari') {
    const dealerWon = handResult.winnerIndex === dealerIndex;

    if (isAllLast) {
      if (dealerWon) {
        return { type: 'renchan', incrementHonba: true };
      } else {
        return { type: 'end_game', distributeRiichiSticks: false };
      }
    }

    if (dealerWon) {
      return { type: 'renchan', incrementHonba: true };
    } else {
      return { type: 'rotate_dealer', resetHonba: true };
    }
  }

  // Ryuukyoku
  const dealerTenpai = handResult.tenpaiStatus[dealerIndex];

  if (isAllLast) {
    if (dealerTenpai) {
      return { type: 'renchan', incrementHonba: true };
    } else {
      return { type: 'end_game', distributeRiichiSticks: true };
    }
  }

  if (dealerTenpai) {
    return { type: 'renchan', incrementHonba: true };
  } else {
    // Dealer not tenpai: rotate, but honba carries (does NOT reset)
    return { type: 'rotate_dealer', resetHonba: false };
  }
}

/**
 * Check if the current hand is "All Last" (South 4).
 */
export function isAllLastHand(game: Game): boolean {
  return game.currentRound.wind === 'south' && game.currentRound.number === 4;
}

/**
 * Process a hand result: calculate transfers, update game state, return the recorded hand.
 */
export function processHandResult(game: Game, input: HandResultInput): Hand {
  const pointsBefore = game.players.map(p => p.points);

  // Build the full HandResult
  let result: HandResult;
  if (input.resultType === 'agari') {
    const isDealer = input.winnerIndex === game.currentDealer;
    const calc = calculatePoints({
      han: input.han!,
      fu: input.fu!,
      isDealer,
      isTsumo: input.isTsumo!,
    });

    result = {
      type: 'agari',
      winnerIndex: input.winnerIndex!,
      loserIndex: input.isTsumo ? null : input.loserIndex!,
      isTsumo: input.isTsumo!,
      han: input.han!,
      fu: input.fu!,
      pointsWon: calc.total,
      honbaBonus: game.honbaCount * (input.isTsumo ? 300 : 300),
      riichiSticksCollected: game.riichiSticks,
    };
  } else {
    result = {
      type: 'ryuukyoku',
      tenpaiStatus: input.tenpaiStatus!,
      ...(input.nagashiManganIndex !== undefined ? { nagashiManganIndex: input.nagashiManganIndex } : {}),
    };
  }

  // Calculate point transfers
  const { deltas } = calculateTransfers(
    result,
    game.currentDealer,
    game.honbaCount,
    game.riichiSticks,
  );

  // Apply point changes
  for (let i = 0; i < 4; i++) {
    game.players[i].points += deltas[i];
  }

  const pointsAfter = game.players.map(p => p.points);

  // Create the hand record
  const hand: Hand = {
    id: `${game.id}-h${game.hands.length + 1}`,
    gameId: game.id,
    handNumber: game.hands.length + 1,
    round: { ...game.currentRound },
    dealerIndex: game.currentDealer,
    honba: game.honbaCount,
    riichiSticksOnTable: game.riichiSticks,
    result,
    pointsBefore,
    pointsAfter,
    recordedAt: Date.now(),
  };

  game.hands.push(hand);

  // Tobi check: if enabled and any player went negative (< 0), end game immediately
  if (game.ruleset.tobiEnabled && game.players.some(p => p.points < 0)) {
    if (result.type === 'agari') {
      game.riichiSticks = 0;
    }
    game.status = 'completed';
    return hand;
  }

  // Determine next state
  const action = determineNextState(game, result);

  switch (action.type) {
    case 'renchan':
      if (action.incrementHonba) {
        game.honbaCount++;
      }
      // Riichi sticks cleared if agari (winner collected them)
      if (result.type === 'agari') {
        game.riichiSticks = 0;
      }
      break;

    case 'rotate_dealer':
      if (action.resetHonba) {
        game.honbaCount = 0;
      } else {
        game.honbaCount++;
      }
      // Riichi sticks cleared if agari
      if (result.type === 'agari') {
        game.riichiSticks = 0;
      }
      advanceRound(game);
      break;

    case 'end_game':
      if (result.type === 'agari') {
        game.riichiSticks = 0;
      }
      game.status = 'completed';
      break;
  }

  return hand;
}

/**
 * Advance to the next round (rotate dealer).
 */
function advanceRound(game: Game): void {
  game.currentDealer = (game.currentDealer + 1) % 4;

  // If dealer wraps to 0, we've completed a full rotation → next wind
  if (game.currentDealer === 0) {
    if (game.currentRound.wind === 'east') {
      game.currentRound = { wind: 'south', number: 1 };
    }
    // South wind wrapping would mean game should have ended at All Last
    // This shouldn't happen in M-League (no enchousen)
  } else {
    game.currentRound = {
      wind: game.currentRound.wind,
      number: game.currentRound.number + 1,
    };
  }
}

/**
 * Undo the last hand: revert point changes and game state.
 * Returns the removed hand, or null if no hands to undo.
 */
export function undoLastHand(game: Game): Hand | null {
  if (game.hands.length === 0) return null;

  const hand = game.hands.pop()!;

  // Restore points
  for (let i = 0; i < 4; i++) {
    game.players[i].points = hand.pointsBefore[i];
  }

  // Restore round state
  game.currentRound = { ...hand.round };
  game.currentDealer = hand.dealerIndex;
  game.honbaCount = hand.honba;
  game.riichiSticks = hand.riichiSticksOnTable;
  game.status = 'in_progress';

  return hand;
}
