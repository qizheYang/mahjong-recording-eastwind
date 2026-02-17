import type { Wind, Ruleset } from '../constants.js';

export interface Round {
  wind: 'east' | 'south';
  number: number; // 1-4
}

export type GameStatus = 'in_progress' | 'completed';

export interface GamePlayer {
  id: string;
  name: string;
  points: number;
  initialSeat: Wind;
}

export interface Game {
  id: string;
  roomCode: string;
  players: GamePlayer[];
  hands: Hand[];
  currentRound: Round;
  currentDealer: number; // index 0-3
  honbaCount: number;
  riichiSticks: number; // uncollected riichi sticks on table
  status: GameStatus;
  ruleset: Ruleset;
}

export interface Hand {
  id: string;
  gameId: string;
  handNumber: number;
  round: Round;
  dealerIndex: number;
  honba: number;
  riichiSticksOnTable: number;
  result: HandResult;
  pointsBefore: number[];
  pointsAfter: number[];
  recordedAt: number;
}

export type HandResult = AgariResult | RyuukyokuResult;

export interface AgariResult {
  type: 'agari';
  winnerIndex: number;
  loserIndex: number | null; // null = tsumo
  isTsumo: boolean;
  han: number;
  fu: number;
  pointsWon: number;
  honbaBonus: number;
  riichiSticksCollected: number;
}

export interface RyuukyokuResult {
  type: 'ryuukyoku';
  tenpaiStatus: boolean[]; // [p0, p1, p2, p3]
}

export interface FinalScore {
  playerIndex: number;
  name: string;
  rawPoints: number;
  placement: number;
  uma: number;
  gameScore: number;
}
