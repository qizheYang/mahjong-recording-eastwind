// Types
export type { Player, Room, RoomStatus } from './types/room.js';
export type {
  Round, GameStatus, GamePlayer, Game, Hand, HandResult,
  AgariResult, RyuukyokuResult, FinalScore,
} from './types/game.js';
export type { ClientEvent, ServerEvent, HandResultInput } from './types/ws-events.js';

// Constants
export { WINDS, WIND_LABELS, M_LEAGUE_RULES, defaultScoreFormula } from './constants.js';
export type { Wind, Ruleset } from './constants.js';

// Scoring
export { calculatePoints } from './scoring/calculator.js';
export type { PointCalcInput, PointCalcResult } from './scoring/calculator.js';
export { calculateTransfers } from './scoring/transfers.js';
export type { TransferResult } from './scoring/transfers.js';
export { calculateFinalScores, evaluateScoreFormula } from './scoring/final-score.js';
export {
  NON_DEALER_RON, DEALER_RON, NON_DEALER_TSUMO, DEALER_TSUMO,
  LIMIT_HANDS, getLimitHand,
} from './scoring/tables.js';

// Game logic
export {
  determineNextState, isAllLastHand, processHandResult, undoLastHand,
} from './game-logic/state-machine.js';
export type { GameStateAction } from './game-logic/state-machine.js';
