import type { Room, Player } from './room.js';
import type { Game, Hand, FinalScore } from './game.js';
import type { Ruleset } from '../constants.js';

// Client -> Server events
export type ClientEvent =
  | { type: 'join_room'; roomCode: string; playerName: string; phone?: string }
  | { type: 'leave_room' }
  | { type: 'ready_toggle' }
  | { type: 'swap_seats'; playerIdA: string; playerIdB: string }
  | { type: 'start_game'; seatOrder: string[]; ruleset?: Partial<Ruleset>; tags?: string[] }
  | { type: 'record_hand'; result: HandResultInput }
  | { type: 'undo_last_hand' }
  | { type: 'end_game' };

export interface HandResultInput {
  resultType: 'agari' | 'ryuukyoku';
  // For agari
  winnerIndex?: number;
  loserIndex?: number;
  isTsumo?: boolean;
  han?: number;
  fu?: number;
  // For ryuukyoku
  tenpaiStatus?: boolean[];
  nagashiManganIndex?: number; // 流局満貫
  // Riichi declarations this hand
  riichiPlayers?: boolean[]; // [p0, p1, p2, p3]
}

// Server -> Client events
export type ServerEvent =
  | { type: 'room_state'; room: Room }
  | { type: 'player_joined'; player: Player }
  | { type: 'player_left'; playerId: string }
  | { type: 'player_ready'; playerId: string; ready: boolean }
  | { type: 'seats_swapped'; players: Player[] }
  | { type: 'game_started'; game: Game }
  | { type: 'hand_recorded'; hand: Hand; game: Game }
  | { type: 'hand_undone'; game: Game }
  | { type: 'game_ended'; game: Game; finalScores: FinalScore[]; savedFilename?: string }
  | { type: 'error'; message: string; code: string };
