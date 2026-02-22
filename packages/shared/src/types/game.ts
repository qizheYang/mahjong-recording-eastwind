import type { Wind, Ruleset } from '../constants.js';
import type { HandResultInput } from './ws-events.js';

export interface Round {
  wind: 'east' | 'south';
  number: number; // 1-4
}

export type GameStatus = 'in_progress' | 'completed';

export interface GamePlayer {
  id: string;
  name: string;
  phone?: string;
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
  tags: string[];
}

export interface Hand {
  id: string;
  gameId: string;
  handNumber: number;
  round: Round;
  dealerIndex: number;
  honba: number;
  riichiSticksOnTable: number;
  riichiPlayers: boolean[]; // [p0, p1, p2, p3] - who declared riichi this hand
  result: HandResult;
  pointsBefore: number[];
  pointsAfter: number[];
  recordedAt: number;
  input?: HandResultInput; // original input for replay/edit
}

export type HandResult = AgariResult | MultiAgariResult | RyuukyokuResult;

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
  yakumanList?: string[];
  yakumanCount?: number; // multiplier: 1=single, 2=double, 3=triple
}

export interface MultiAgariWinner {
  winnerIndex: number;
  han: number;
  fu: number;
  pointsWon: number;
  riichiSticksCollected: number;
  yakumanList?: string[];
  yakumanCount?: number;
}

export interface MultiAgariResult {
  type: 'multi_agari';
  loserIndex: number;
  winners: MultiAgariWinner[];
  honbaBonus: number; // per-winner honba bonus (300 * honba)
}

export interface RyuukyokuResult {
  type: 'ryuukyoku';
  tenpaiStatus: boolean[]; // [p0, p1, p2, p3]
  nagashiManganPlayers?: boolean[]; // [p0, p1, p2, p3] - who achieved nagashi mangan (流局満貫)
}

export interface FinalScore {
  playerIndex: number;
  name: string;
  rawPoints: number;
  placement: number;
  uma: number;
  gameScore: number;
}
