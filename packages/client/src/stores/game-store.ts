import { create } from 'zustand';
import type { Room, Game, Hand, FinalScore, TeamScore, ServerEvent, ClientEvent, HandResultInput, PenaltyInput, Ruleset, Wind } from '@mahjong/shared';
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
  teamScores: TeamScore[] | null;
  savedFilename: string | null;
  wasForceQuit: boolean;

  // Ruleset config (for lobby)
  customRuleset: Partial<Ruleset>;

  // Game tags (for lobby)
  gameTags: string[];

  // Team assignments (for lobby)
  teamAssignments: Record<string, string>; // playerId -> teamName

  // Wind assignments (for lobby, team mode)
  windAssignments: Record<string, Wind>; // playerId -> wind

  // Per-player starting points (for lobby)
  customStartingPointsEnabled: boolean;
  playerStartingPoints: Record<string, number>; // playerId -> points

  // UI state
  error: string | null;
  errorCode: string | null;

  // Actions
  setSession: (roomCode: string, playerId: string) => void;
  connect: () => void;
  disconnect: () => void;
  toggleReady: () => boolean;
  swapSeats: (playerIdA: string, playerIdB: string) => boolean;
  setRuleset: (updates: Partial<Ruleset>) => void;
  toggleTag: (tag: string) => void;
  setTeamAssignment: (playerId: string, teamName: string) => void;
  clearTeamAssignments: () => void;
  setWindAssignment: (playerId: string, wind: Wind) => void;
  clearWindAssignments: () => void;
  setCustomStartingPointsEnabled: (enabled: boolean) => void;
  setPlayerStartingPoints: (playerId: string, points: number) => void;
  startGame: (seatOrder: string[], ruleset?: Partial<Ruleset>) => boolean;
  recordHand: (result: HandResultInput) => boolean;
  editHand: (handNumber: number, result: HandResultInput) => boolean;
  undoLastHand: () => boolean;
  recordPenalty: (penalty: PenaltyInput) => boolean;
  undoPenalty: () => boolean;
  endGame: () => boolean;
  forceQuitGame: () => boolean;
  clearError: () => void;
  resetForNewGame: () => void;
  leaveRoom: () => void;
}

let wsClient: WsClient | null = null;

export const useGameStore = create<GameStore>((set, get) => ({
  roomCode: null,
  playerId: null,
  connected: false,
  room: null,
  game: null,
  finalScores: null,
  teamScores: null,
  savedFilename: null,
  wasForceQuit: false,
  customRuleset: {},
  gameTags: [],
  teamAssignments: {},
  windAssignments: {},
  customStartingPointsEnabled: false,
  playerStartingPoints: {},
  error: null,
  errorCode: null,

  setSession(roomCode: string, playerId: string) {
    const prev = get();
    // If switching to a different room, disconnect old WS and clear stale state
    if (prev.roomCode && prev.roomCode !== roomCode) {
      if (wsClient) {
        wsClient.disconnect();
        wsClient = null;
      }
      set({
        roomCode, playerId,
        room: null, game: null, finalScores: null, teamScores: null, savedFilename: null,
        connected: false, customRuleset: {}, gameTags: [], teamAssignments: {}, windAssignments: {},
        customStartingPointsEnabled: false, playerStartingPoints: {},
      });
    } else {
      set({ roomCode, playerId });
    }
    // Persist for reconnection
    localStorage.setItem('roomCode', roomCode);
    localStorage.setItem('playerId', playerId);
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

    wsClient.onStatus((status: boolean) => {
      set({ connected: status });
    });

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
          set({ game: event.game, finalScores: null, savedFilename: event.savedFilename ?? null });
          break;

        case 'hand_recorded':
          set({ game: event.game, ...(event.savedFilename ? { savedFilename: event.savedFilename } : {}) });
          break;

        case 'hand_undone':
          set({ game: event.game });
          break;

        case 'hand_edited':
          set({ game: event.game });
          break;

        case 'penalty_recorded':
          set({ game: event.game });
          break;

        case 'penalty_undone':
          set({ game: event.game });
          break;

        case 'game_ended':
          set({ game: event.game, finalScores: event.finalScores, teamScores: event.teamScores ?? null, savedFilename: event.savedFilename ?? null });
          break;

        case 'room_killed':
          localStorage.removeItem('roomCode');
          localStorage.removeItem('playerId');
          if (wsClient) {
            wsClient.disconnect();
            wsClient = null;
          }
          set({ room: null, game: null, roomCode: null, playerId: null, connected: false, error: event.reason, errorCode: 'ROOM_KILLED' });
          break;

        case 'error':
          set({ error: event.message, errorCode: event.code ?? null });
          // Invalid room/player — clear stale session so we don't retry on reload
          if (event.code === 'INVALID_ROOM') {
            localStorage.removeItem('roomCode');
            localStorage.removeItem('playerId');
            if (wsClient) {
              wsClient.disconnect();
              wsClient = null;
            }
            set({ roomCode: null, playerId: null, connected: false });
          }
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
    return wsClient?.send({ type: 'ready_toggle' }) ?? false;
  },

  swapSeats(playerIdA: string, playerIdB: string) {
    return wsClient?.send({ type: 'swap_seats', playerIdA, playerIdB }) ?? false;
  },

  setRuleset(updates: Partial<Ruleset>) {
    set((state) => ({
      customRuleset: { ...state.customRuleset, ...updates },
    }));
  },

  toggleTag(tag: string) {
    set((state) => ({
      gameTags: state.gameTags.includes(tag)
        ? state.gameTags.filter(t => t !== tag)
        : [...state.gameTags, tag],
    }));
  },

  setTeamAssignment(playerId: string, teamName: string) {
    set((state) => ({
      teamAssignments: { ...state.teamAssignments, [playerId]: teamName },
    }));
  },

  clearTeamAssignments() {
    set({ teamAssignments: {} });
  },

  setWindAssignment(playerId: string, wind: Wind) {
    set((state) => ({
      windAssignments: { ...state.windAssignments, [playerId]: wind },
    }));
  },

  clearWindAssignments() {
    set({ windAssignments: {} });
  },

  setCustomStartingPointsEnabled(enabled: boolean) {
    set({ customStartingPointsEnabled: enabled, playerStartingPoints: {} });
  },

  setPlayerStartingPoints(playerId: string, points: number) {
    set((state) => ({
      playerStartingPoints: { ...state.playerStartingPoints, [playerId]: points },
    }));
  },

  startGame(seatOrder: string[], ruleset?: Partial<Ruleset>) {
    const r = ruleset ?? get().customRuleset;
    const tags = get().gameTags;
    const hasCustom = Object.keys(r).length > 0;
    const teamAssignments = get().teamAssignments;
    const nonEmptyTeams = Object.entries(teamAssignments).filter(([, team]) => team.trim() !== '');
    const teams = nonEmptyTeams.length > 0
      ? nonEmptyTeams.map(([playerId, team]) => ({ playerId, team }))
      : undefined;
    const { customStartingPointsEnabled, playerStartingPoints } = get();
    const psp = customStartingPointsEnabled && Object.keys(playerStartingPoints).length > 0
      ? playerStartingPoints
      : undefined;
    return wsClient?.send({
      type: 'start_game',
      seatOrder,
      ...(hasCustom ? { ruleset: r } : {}),
      ...(tags.length > 0 ? { tags } : {}),
      ...(teams ? { teams } : {}),
      ...(psp ? { playerStartingPoints: psp } : {}),
    }) ?? false;
  },

  recordHand(result: HandResultInput) {
    return wsClient?.send({ type: 'record_hand', result }) ?? false;
  },

  editHand(handNumber: number, result: HandResultInput) {
    return wsClient?.send({ type: 'edit_hand', handNumber, result }) ?? false;
  },

  undoLastHand() {
    return wsClient?.send({ type: 'undo_last_hand' }) ?? false;
  },

  recordPenalty(penalty: PenaltyInput) {
    return wsClient?.send({ type: 'record_penalty', penalty }) ?? false;
  },

  undoPenalty() {
    return wsClient?.send({ type: 'undo_penalty' }) ?? false;
  },

  endGame() {
    return wsClient?.send({ type: 'end_game' }) ?? false;
  },

  forceQuitGame() {
    set({ wasForceQuit: true });
    return wsClient?.send({ type: 'force_quit_game' }) ?? false;
  },

  clearError() {
    set({ error: null, errorCode: null });
  },

  resetForNewGame() {
    set({ game: null, finalScores: null, teamScores: null, savedFilename: null, wasForceQuit: false, customRuleset: {}, gameTags: [], teamAssignments: {}, windAssignments: {}, customStartingPointsEnabled: false, playerStartingPoints: {} });
  },

  leaveRoom() {
    localStorage.removeItem('roomCode');
    localStorage.removeItem('playerId');
    if (wsClient) {
      wsClient.disconnect();
      wsClient = null;
    }
    set({
      roomCode: null, playerId: null, connected: false,
      room: null, game: null, finalScores: null, teamScores: null, savedFilename: null,
      wasForceQuit: false,
      customRuleset: {}, gameTags: [], teamAssignments: {}, windAssignments: {},
      customStartingPointsEnabled: false, playerStartingPoints: {},
      error: null, errorCode: null,
    });
  },
}));
