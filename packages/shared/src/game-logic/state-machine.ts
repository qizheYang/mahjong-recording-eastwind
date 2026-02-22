import type { Game, Hand, HandResult, AgariResult, MultiAgariResult, MultiAgariWinner, RyuukyokuResult, Round, Penalty } from '../types/game.js';
import type { HandResultInput, PenaltyInput } from '../types/ws-events.js';
import { calculateTransfers } from '../scoring/transfers.js';
import { calculatePoints, calculateYakumanMultiplier } from '../scoring/calculator.js';

export type GameStateAction =
  | { type: 'renchan'; incrementHonba: boolean }
  | { type: 'rotate_dealer'; resetHonba: boolean }
  | { type: 'end_game'; distributeRiichiSticks: boolean };

/**
 * Check if the result is an agari (win) type — either single or multi.
 */
function isAgariResult(result: HandResult): boolean {
  return result.type === 'agari' || result.type === 'multi_agari';
}

/**
 * Check if the dealer is among the winners.
 */
function dealerWon(result: HandResult, dealerIndex: number): boolean {
  if (result.type === 'agari') {
    return result.winnerIndex === dealerIndex;
  }
  if (result.type === 'multi_agari') {
    return result.winners.some(w => w.winnerIndex === dealerIndex);
  }
  return false;
}

/**
 * Determine the next game state transition after a hand result.
 */
export function determineNextState(
  game: Game,
  handResult: HandResult,
): GameStateAction {
  const dealerIndex = game.currentDealer;
  const isAllLast = isAllLastHand(game);

  if (isAgariResult(handResult)) {
    const dealerIsWinner = dealerWon(handResult, dealerIndex);

    if (isAllLast) {
      if (dealerIsWinner) {
        return { type: 'renchan', incrementHonba: true };
      } else {
        return { type: 'end_game', distributeRiichiSticks: false };
      }
    }

    if (dealerIsWinner) {
      return { type: 'renchan', incrementHonba: true };
    } else {
      return { type: 'rotate_dealer', resetHonba: true };
    }
  }

  // Ryuukyoku
  const dealerTenpai = (handResult as RyuukyokuResult).tenpaiStatus[dealerIndex];

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

  // Apply riichi deposits before hand processing
  const riichiPlayers = input.riichiPlayers ?? [false, false, false, false];
  for (let i = 0; i < 4; i++) {
    if (riichiPlayers[i]) {
      game.players[i].points -= 1000;
      game.riichiSticks++;
    }
  }

  // Build the full HandResult
  let result: HandResult;
  if (input.resultType === 'agari' && input.multiRon) {
    // Multi-ron (double/triple ron)
    const { loserIndex, winners: winnerInputs } = input.multiRon;
    const closestWinnerIdx = getClosestWinnerIndex(loserIndex, winnerInputs.map(w => w.winnerIndex));

    const winners: MultiAgariWinner[] = winnerInputs.map(w => {
      const isDealer = w.winnerIndex === game.currentDealer;
      const yakumanCount = w.yakumanList?.length
        ? calculateYakumanMultiplier(w.yakumanList, game.ruleset.doubleYakumanEnabled, game.ruleset.multipleYakumanEnabled)
        : undefined;
      const calc = calculatePoints({
        han: w.han, fu: w.fu, isDealer, isTsumo: false,
        kiriageMangan: game.ruleset.kiriageMangan,
        yakumanCount,
      });
      return {
        winnerIndex: w.winnerIndex,
        han: w.han,
        fu: w.fu,
        pointsWon: calc.total,
        riichiSticksCollected: w.winnerIndex === closestWinnerIdx ? game.riichiSticks : 0,
        ...(w.yakumanList?.length ? { yakumanList: w.yakumanList, yakumanCount } : {}),
      };
    });

    result = {
      type: 'multi_agari',
      loserIndex,
      winners,
      honbaBonus: game.honbaCount * 300,
    };
  } else if (input.resultType === 'agari') {
    const isDealer = input.winnerIndex === game.currentDealer;
    const yakumanCount = input.yakumanList?.length
      ? calculateYakumanMultiplier(input.yakumanList, game.ruleset.doubleYakumanEnabled, game.ruleset.multipleYakumanEnabled)
      : undefined;
    const calc = calculatePoints({
      han: input.han!,
      fu: input.fu!,
      isDealer,
      isTsumo: input.isTsumo!,
      kiriageMangan: game.ruleset.kiriageMangan,
      yakumanCount,
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
      ...(input.yakumanList?.length ? { yakumanList: input.yakumanList, yakumanCount } : {}),
    };
  } else {
    result = {
      type: 'ryuukyoku',
      tenpaiStatus: input.tenpaiStatus!,
      ...(input.nagashiManganPlayers?.some(Boolean) ? { nagashiManganPlayers: input.nagashiManganPlayers } : {}),
    };
  }

  // Calculate point transfers
  const { deltas } = calculateTransfers(
    result,
    game.currentDealer,
    game.honbaCount,
    game.riichiSticks,
    game.ruleset.kiriageMangan,
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
    riichiPlayers,
    result,
    pointsBefore,
    pointsAfter,
    recordedAt: Date.now(),
    input,
  };

  game.hands.push(hand);

  // Tobi check: if enabled and any player went negative (< 0), end game immediately
  if (game.ruleset.tobiEnabled && game.players.some(p => p.points < 0)) {
    if (isAgariResult(result)) {
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
      if (isAgariResult(result)) {
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
      if (isAgariResult(result)) {
        game.riichiSticks = 0;
      }
      advanceRound(game);
      break;

    case 'end_game':
      if (isAgariResult(result)) {
        game.riichiSticks = 0;
      }
      game.status = 'completed';
      break;
  }

  return hand;
}

/**
 * Get the closest winner to the loser in turn order (shimocha first).
 * Used to determine who collects riichi sticks in multi-ron.
 */
function getClosestWinnerIndex(loserIndex: number, winnerIndices: number[]): number {
  for (let offset = 1; offset <= 3; offset++) {
    const candidate = (loserIndex + offset) % 4;
    if (winnerIndices.includes(candidate)) return candidate;
  }
  return winnerIndices[0];
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
 * Edit a previously recorded hand by replaying from that point.
 * Undoes all hands from last to target, re-processes with new input, then replays remaining.
 * Returns true on success.
 */
export function editHand(game: Game, handNumber: number, newInput: HandResultInput): boolean {
  const targetIdx = game.hands.findIndex(h => h.handNumber === handNumber);
  if (targetIdx === -1) return false;

  // Collect inputs for hands after the target (to replay them)
  const subsequentInputs: HandResultInput[] = [];
  for (let i = targetIdx + 1; i < game.hands.length; i++) {
    const h = game.hands[i];
    if (!h.input) return false; // Cannot replay without stored input
    subsequentInputs.push(h.input);
  }

  // Undo all hands from last back to target (inclusive)
  const undoCount = game.hands.length - targetIdx;
  for (let i = 0; i < undoCount; i++) {
    undoLastHand(game);
  }

  // Re-process the edited hand with new input
  processHandResult(game, newInput);

  // Replay subsequent hands
  for (const inp of subsequentInputs) {
    if (game.status === 'completed') break; // game may have ended early
    processHandResult(game, inp);
  }

  return true;
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
  // riichiSticksOnTable includes this hand's deposits, so subtract them to restore pre-deposit state
  const riichiCount = (hand.riichiPlayers ?? []).filter(Boolean).length;
  game.riichiSticks = hand.riichiSticksOnTable - riichiCount;
  game.status = 'in_progress';

  return hand;
}

/**
 * Record a penalty during a game.
 * - 'immediate': deducts from offender, splits equally among the other 3 players.
 * - 'final_score': stored but not applied to in-game points (applied in calculateFinalScores).
 */
export function recordPenalty(game: Game, input: PenaltyInput): Penalty {
  const penalty: Penalty = {
    id: `${game.id}-pen${(game.penalties?.length ?? 0) + 1}`,
    type: input.type,
    playerIndex: input.playerIndex,
    amount: input.amount,
    reason: input.reason,
    recordedAt: Date.now(),
  };

  if (!game.penalties) game.penalties = [];
  game.penalties.push(penalty);

  if (input.type === 'immediate') {
    // Deduct from offender, distribute to other 3 players
    const perPlayer = Math.floor(input.amount / 3);
    game.players[input.playerIndex].points -= input.amount;
    for (let i = 0; i < 4; i++) {
      if (i !== input.playerIndex) {
        game.players[i].points += perPlayer;
      }
    }
  }

  return penalty;
}

/**
 * Undo the last penalty. Reverses immediate point changes if applicable.
 */
export function undoLastPenalty(game: Game): Penalty | null {
  if (!game.penalties?.length) return null;

  const penalty = game.penalties.pop()!;

  if (penalty.type === 'immediate') {
    // Reverse the point changes
    const perPlayer = Math.floor(penalty.amount / 3);
    game.players[penalty.playerIndex].points += penalty.amount;
    for (let i = 0; i < 4; i++) {
      if (i !== penalty.playerIndex) {
        game.players[i].points -= perPlayer;
      }
    }
  }

  return penalty;
}
