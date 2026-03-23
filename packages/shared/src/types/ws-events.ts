import type { Room, Player } from './room.js';
import type { Game, Hand, FinalScore, Penalty, TeamScore } from './game.js';
import type { Ruleset } from '../constants.js';

// Client -> Server events
export type ClientEvent =
  | { type: 'join_room'; roomCode: string; playerName: string; phone?: string }
  | { type: 'leave_room' }
  | { type: 'ready_toggle' }
  | { type: 'swap_seats'; playerIdA: string; playerIdB: string }
  | { type: 'start_game'; seatOrder: string[]; ruleset?: Partial<Ruleset>; tags?: string[]; teams?: { playerId: string; team: string }[]; playerStartingPoints?: Record<string, number> }
  | { type: 'record_hand'; result: HandResultInput }
  | { type: 'edit_hand'; handNumber: number; result: HandResultInput }
  | { type: 'undo_last_hand' }
  | { type: 'record_penalty'; penalty: PenaltyInput }
  | { type: 'undo_penalty' }
  | { type: 'end_game' }
  | { type: 'force_quit_game' }
  | { type: 'toggle_riichi'; playerIndex: number };

export interface PenaltyInput {
  type: 'final_score' | 'immediate';
  playerIndex: number;
  amount: number;
  reason?: string;
}

export interface MultiRonWinnerInput {
  winnerIndex: number;
  han: number;
  fu: number;
  yakumanList?: string[];
}

export interface HandResultInput {
  resultType: 'agari' | 'ryuukyoku';
  // For single agari
  winnerIndex?: number;
  loserIndex?: number;
  isTsumo?: boolean;
  han?: number;
  fu?: number;
  yakumanList?: string[]; // specific yakuman hands selected
  // For multi-ron (double/triple ron)
  multiRon?: {
    loserIndex: number;
    winners: MultiRonWinnerInput[];
  };
  // For ryuukyoku
  tenpaiStatus?: boolean[];
  nagashiManganPlayers?: boolean[]; // [p0, p1, p2, p3] 流局満貫
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
  | { type: 'game_started'; game: Game; savedFilename?: string }
  | { type: 'hand_recorded'; hand: Hand; game: Game; savedFilename?: string }
  | { type: 'hand_undone'; game: Game }
  | { type: 'hand_edited'; game: Game }
  | { type: 'penalty_recorded'; penalty: Penalty; game: Game }
  | { type: 'penalty_undone'; game: Game }
  | { type: 'game_ended'; game: Game; finalScores: FinalScore[]; savedFilename?: string; teamScores?: TeamScore[] }
  | { type: 'riichi_toggled'; playerIndex: number; riichi: boolean; liveRiichi: boolean[] }
  | { type: 'room_killed'; reason: string }
  | { type: 'error'; message: string; code: string };
