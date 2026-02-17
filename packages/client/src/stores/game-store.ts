import { create } from 'zustand';
import type { Room, Game, Hand, FinalScore, ServerEvent, ClientEvent, HandResultInput, Ruleset } from '@mahjong/shared';
import { M_LEAGUE_RULES } from '@mahjong/shared';
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

  // Ruleset config (for lobby)
  customRuleset: Partial<Ruleset>;

  // UI state
  error: string | null;

  // Actions
  setSession: (roomCode: string, playerId: string) => void;
  connect: () => void;
  disconnect: () => void;
  toggleReady: () => void;
  swapSeats: (playerIdA: string, playerIdB: string) => void;
  setRuleset: (updates: Partial<Ruleset>) => void;
  startGame: (seatOrder: string[], ruleset?: Partial<Ruleset>) => void;
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
  customRuleset: {},
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

        case 'player_ready':
          set((state) => {
            if (!state.room) return state;
            return {
              room: {
                ...state.room,
                players: state.room.players.map(p =>
                  p.id === event.playerId ? { ...p, ready: event.ready } : p
                ),
              },
            };
          });
          break;

        case 'seats_swapped':
          set((state) => {
            if (!state.room) return state;
            return {
              room: { ...state.room, players: event.players },
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

  toggleReady() {
    wsClient?.send({ type: 'ready_toggle' });
  },

  swapSeats(playerIdA: string, playerIdB: string) {
    wsClient?.send({ type: 'swap_seats', playerIdA, playerIdB });
  },

  setRuleset(updates: Partial<Ruleset>) {
    set((state) => ({
      customRuleset: { ...state.customRuleset, ...updates },
    }));
  },

  startGame(seatOrder: string[], ruleset?: Partial<Ruleset>) {
    const r = ruleset ?? get().customRuleset;
    const hasCustom = Object.keys(r).length > 0;
    wsClient?.send({ type: 'start_game', seatOrder, ...(hasCustom ? { ruleset: r } : {}) });
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
    set({ game: null, finalScores: null, customRuleset: {} });
  },
}));
