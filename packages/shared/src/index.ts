// Types
export type { Player, Room, RoomStatus } from './types/room.js';
export type {
  Round, GameStatus, GamePlayer, Game, Hand, HandResult,
  AgariResult, MultiAgariResult, MultiAgariWinner, RyuukyokuResult, FinalScore, Penalty, TeamScore,
} from './types/game.js';
export type { ClientEvent, ServerEvent, HandResultInput, MultiRonWinnerInput, PenaltyInput } from './types/ws-events.js';

// Constants
export {
  WINDS, WIND_LABELS, M_LEAGUE_RULES, OFFICIAL_MATCH_RULES, SAIKOUISEN_RULES, WRC_RULES, SCMA_2V2_RULES,
  PRESET_RULESETS, defaultScoreFormula, PREDEFINED_TAGS, validateUma, YAKUMAN_LIST,
} from './constants.js';
export type { Wind, Ruleset, PresetName, YakumanId } from './constants.js';

// Scoring
export { calculatePoints, calculateYakumanMultiplier } from './scoring/calculator.js';
export type { PointCalcInput, PointCalcResult } from './scoring/calculator.js';
export { calculateTransfers } from './scoring/transfers.js';
export type { TransferResult, TransferOptions } from './scoring/transfers.js';
export { calculateFinalScores, calculateTeamScores, evaluateScoreFormula } from './scoring/final-score.js';
export {
  NON_DEALER_RON, DEALER_RON, NON_DEALER_TSUMO, DEALER_TSUMO,
  LIMIT_HANDS, getLimitHand,
} from './scoring/tables.js';

// Game logic
export {
  determineNextState, isAllLastHand, processHandResult, undoLastHand, editHand,
  recordPenalty, undoLastPenalty,
} from './game-logic/state-machine.js';
export type { GameStateAction } from './game-logic/state-machine.js';
