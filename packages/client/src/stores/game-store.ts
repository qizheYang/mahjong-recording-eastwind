import { create } from 'zustand';
import type { Room, Game, Hand, FinalScore, ServerEvent, ClientEvent, HandResultInput } from '@mahjong/shared';
import { WsClient } from '../lib/ws-client';
import { config } from '../config';

interface GameStore {
  // Connection state
  roomCode: string | null;
  playerId: string | null;
  connected: boolean;

  // Room & game state
  room: Room | null;
  game: Game | null;
  finalScores: FinalScore[] | null;

  // UI state
  error: string | null;

  // Actions
  setSession: (roomCode: string, playerId: string) => void;
  connect: () => void;
  disconnect: () => void;
  startGame: (seatOrder: string[]) => void;
  recordHand: (result: HandResultInput) => void;
  undoLastHand: () => void;
  endGame: () => void;
  clearError: () => void;
  resetForNewGame: () => void;
}

let wsClient: WsClient | null = null;

export const useGameStore = create<GameStore>((set, get) => ({
  roomCode: null,
  playerId: null,
  connected: false,
  room: null,
  game: null,
  finalScores: null,
  error: null,

  setSession(roomCode: string, playerId: string) {
    set({ roomCode, playerId });
    // Persist for reconnection
    sessionStorage.setItem('roomCode', roomCode);
    sessionStorage.setItem('playerId', playerId);
  },

  connect() {
    const { roomCode, playerId } = get();
    if (!roomCode || !playerId) return;

    // Idempotent: skip if already connected or connecting
    if (wsClient?.isConnected) return;

    if (wsClient) {
      wsClient.disconnect();
    }

    wsClient = new WsClient(config.wsUrl);

    wsClient.onEvent((event: ServerEvent) => {
      switch (event.type) {
        case 'room_state':
          set({
            room: event.room,
            game: event.room.currentGame,
            connected: true,
          });
          break;

        case 'player_joined':
          set((state) => {
            if (!state.room) return state;
            return {
              room: {
                ...state.room,
                players: [...state.room.players.filter(p => p.id !== event.player.id), event.player],
              },
            };
          });
          break;

        case 'player_left':
          set((state) => {
            if (!state.room) return state;
            return {
              room: {
                ...state.room,
                players: state.room.players.filter(p => p.id !== event.playerId),
              },
            };
          });
          break;

        case 'game_started':
          set({ game: event.game, finalScores: null });
          break;

        case 'hand_recorded':
          set({ game: event.game });
          break;

        case 'hand_undone':
          set({ game: event.game });
          break;

        case 'game_ended':
          set({ game: event.game, finalScores: event.finalScores });
          break;

        case 'error':
          set({ error: event.message });
          break;
      }
    });

    wsClient.connect(roomCode, playerId);
  },

  disconnect() {
    if (wsClient) {
      wsClient.disconnect();
      wsClient = null;
    }
    set({ connected: false });
  },

  startGame(seatOrder: string[]) {
    wsClient?.send({ type: 'start_game', seatOrder });
  },

  recordHand(result: HandResultInput) {
    wsClient?.send({ type: 'record_hand', result });
  },

  undoLastHand() {
    wsClient?.send({ type: 'undo_last_hand' });
  },

  endGame() {
    wsClient?.send({ type: 'end_game' });
  },

  clearError() {
    set({ error: null });
  },

  resetForNewGame() {
    set({ game: null, finalScores: null });
  },
}));
