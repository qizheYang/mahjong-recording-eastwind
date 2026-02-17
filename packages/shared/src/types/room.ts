import type { Wind } from '../constants.js';
import type { Game } from './game.js';

export interface Player {
  id: string;
  name: string;
  seatWind: Wind | null;
}

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface Room {
  code: string;
  players: Player[];
  status: RoomStatus;
  currentGame: Game | null;
  createdAt: number;
}
