import type { WSContext } from 'hono/ws';
import type {
  Room, Player, Game, GamePlayer, Hand, FinalScore, Penalty,
  HandResultInput, PenaltyInput, ServerEvent, Ruleset,
} from '@mahjong/shared';
import {
  M_LEAGUE_RULES, WINDS,
  processHandResult, undoLastHand, editHand, calculateFinalScores,
  recordPenalty, undoLastPenalty,
} from '@mahjong/shared';
import { nanoid } from 'nanoid';

interface RoomState {
  room: Room;
  connections: Map<string, WSContext>; // playerId -> ws
  lastActivityAt: number;
}

// Characters that won't be confused (no 0/O, 1/I/L)
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

const INACTIVITY_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours
const CLEANUP_INTERVAL = 10 * 60 * 1000; // check every 10 minutes

export class RoomManager {
  private rooms = new Map<string, RoomState>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanupInactiveRooms(), CLEANUP_INTERVAL);
  }

  private touch(code: string) {
    const state = this.rooms.get(code);
    if (state) state.lastActivityAt = Date.now();
  }

  private cleanupInactiveRooms() {
    const now = Date.now();
    for (const [code, state] of this.rooms) {
      if (now - state.lastActivityAt >= INACTIVITY_TIMEOUT) {
        console.log(`Cleaning up inactive room ${code} (idle ${Math.round((now - state.lastActivityAt) / 60000)}min)`);
        // Close any remaining WebSocket connections
        for (const ws of state.connections.values()) {
          try { ws.close(); } catch { /* ignore */ }
        }
        this.rooms.delete(code);
      }
    }
  }

  createRoom(playerName: string, phone?: string): { roomCode: string; playerId: string } {
    let code = generateRoomCode();
    while (this.rooms.has(code)) {
      code = generateRoomCode();
    }

    const playerId = nanoid(12);
    const player: Player = { id: playerId, name: playerName, ...(phone ? { phone } : {}), seatWind: null, ready: false };

    const room: Room = {
      code,
      players: [player],
      status: 'waiting',
      currentGame: null,
      createdAt: Date.now(),
      creatorId: playerId,
    };

    this.rooms.set(code, { room, connections: new Map(), lastActivityAt: Date.now() });

    return { roomCode: code, playerId };
  }

  joinRoom(roomCode: string, playerName: string, phone?: string): { playerId: string; room: Room } | { error: string } {
    const state = this.rooms.get(roomCode);
    if (!state) return { error: '房间不存在 (Room not found)' };
    if (state.room.players.length >= 4) return { error: '房间已满 (Room is full)' };
    if (state.room.status !== 'waiting') return { error: '对局已开始 (Game already started)' };

    const playerId = nanoid(12);
    const player: Player = { id: playerId, name: playerName, ...(phone ? { phone } : {}), seatWind: null, ready: false };
    state.room.players.push(player);
    this.touch(roomCode);

    return { playerId, room: state.room };
  }

  connectPlayer(roomCode: string, playerId: string, ws: WSContext): Room | null {
    const state = this.rooms.get(roomCode);
    if (!state) return null;

    const player = state.room.players.find(p => p.id === playerId);
    if (!player) return null;

    state.connections.set(playerId, ws);
    this.touch(roomCode);
    return state.room;
  }

  disconnectPlayer(roomCode: string, playerId: string): void {
    const state = this.rooms.get(roomCode);
    if (!state) return;
    state.connections.delete(playerId);
  }

  removePlayer(roomCode: string, playerId: string): void {
    const state = this.rooms.get(roomCode);
    if (!state) return;

    state.connections.delete(playerId);
    state.room.players = state.room.players.filter(p => p.id !== playerId);

    // Clean up empty rooms
    if (state.room.players.length === 0) {
      this.rooms.delete(roomCode);
      return;
    }

    this.broadcast(roomCode, { type: 'player_left', playerId });
  }

  killRoom(roomCode: string, reason: string): boolean {
    const state = this.rooms.get(roomCode);
    if (!state) return false;

    // Broadcast room_killed to all connected clients
    this.broadcast(roomCode, { type: 'room_killed', reason });

    // Close all WebSocket connections
    for (const ws of state.connections.values()) {
      try { ws.close(1000, reason); } catch { /* ignore */ }
    }

    this.rooms.delete(roomCode);
    return true;
  }

  toggleReady(roomCode: string, playerId: string): { ready: boolean; allReady: boolean } | { error: string } {
    const state = this.rooms.get(roomCode);
    if (!state) return { error: '房间不存在' };
    if (state.room.status !== 'waiting') return { error: '对局已开始' };

    const player = state.room.players.find(p => p.id === playerId);
    if (!player) return { error: '玩家不存在' };

    player.ready = !player.ready;
    this.touch(roomCode);

    const allReady = state.room.players.length === 4 && state.room.players.every(p => p.ready);
    return { ready: player.ready, allReady };
  }

  swapSeats(roomCode: string, playerIdA: string, playerIdB: string): Player[] | { error: string } {
    const state = this.rooms.get(roomCode);
    if (!state) return { error: '房间不存在' };
    if (state.room.status !== 'waiting') return { error: '对局已开始' };

    const indexA = state.room.players.findIndex(p => p.id === playerIdA);
    const indexB = state.room.players.findIndex(p => p.id === playerIdB);
    if (indexA === -1 || indexB === -1) return { error: '玩家不存在' };
    if (indexA === indexB) return { error: '不能和自己交换' };

    // Swap positions in the array
    const temp = state.room.players[indexA];
    state.room.players[indexA] = state.room.players[indexB];
    state.room.players[indexB] = temp;

    // Reset everyone's ready state since seats changed
    state.room.players.forEach(p => { p.ready = false; });
    this.touch(roomCode);

    return state.room.players;
  }

  getRoom(roomCode: string): Room | null {
    return this.rooms.get(roomCode)?.room ?? null;
  }

  listRooms() {
    const result: {
      roomCode: string;
      status: string;
      playerNames: string[];
      gameInfo: {
        currentRound: { wind: string; number: number };
        handCount: number;
        honbaCount: number;
        riichiSticks: number;
        playerPoints: { name: string; points: number }[];
      } | null;
    }[] = [];

    for (const [code, state] of this.rooms) {
      const room = state.room;
      if (room.status === 'finished') continue; // don't show finished games
      const game = room.currentGame;
      result.push({
        roomCode: code,
        status: room.status,
        playerNames: room.players.map(p => p.name),
        gameInfo: game ? {
          currentRound: { ...game.currentRound },
          handCount: game.hands.length,
          honbaCount: game.honbaCount,
          riichiSticks: game.riichiSticks,
          playerPoints: game.players.map(p => ({ name: p.name, points: p.points })),
        } : null,
      });
    }
    return result;
  }

  startGame(roomCode: string, seatOrder: string[], customRuleset?: Partial<Ruleset>, tags?: string[], teams?: { playerId: string; team: string }[], playerStartingPoints?: Record<string, number>): Game | { error: string } {
    const state = this.rooms.get(roomCode);
    if (!state) return { error: '房间不存在' };
    if (state.room.players.length !== 4) return { error: '需要4位玩家 (Need 4 players)' };

    const ruleset: Ruleset = { ...M_LEAGUE_RULES, ...customRuleset };

    // Build team lookup
    const teamMap = new Map<string, string>();
    if (teams) {
      for (const t of teams) {
        teamMap.set(t.playerId, t.team);
      }
    }

    // Assign seats based on seatOrder (array of player IDs)
    const gamePlayers: GamePlayer[] = seatOrder.map((id, i) => {
      const player = state.room.players.find(p => p.id === id)!;
      player.seatWind = WINDS[i];
      return {
        id: player.id,
        name: player.name,
        ...(player.phone ? { phone: player.phone } : {}),
        ...(teamMap.get(id) ? { team: teamMap.get(id) } : {}),
        points: playerStartingPoints?.[id] ?? ruleset.startingPoints,
        initialSeat: WINDS[i],
      };
    });

    const game: Game = {
      id: nanoid(16),
      roomCode,
      players: gamePlayers,
      hands: [],
      currentRound: { wind: 'east', number: 1 },
      currentDealer: 0,
      honbaCount: 0,
      riichiSticks: 0,
      status: 'in_progress',
      ruleset,
      tags: tags ?? [],
    };

    state.room.currentGame = game;
    state.room.status = 'playing';
    this.touch(roomCode);

    return game;
  }

  recordHand(roomCode: string, input: HandResultInput): { hand: Hand; game: Game } | { error: string } {
    const state = this.rooms.get(roomCode);
    if (!state) return { error: '房间不存在' };

    const game = state.room.currentGame;
    if (!game || game.status !== 'in_progress') {
      return { error: '没有进行中的对局 (No active game)' };
    }

    const hand = processHandResult(game, input);

    // If game ended naturally (南4 or bust), mark room as finished
    if (game.status === 'completed') {
      state.room.status = 'finished';
    }

    this.touch(roomCode);

    return { hand, game };
  }

  undoHand(roomCode: string): Game | { error: string } {
    const state = this.rooms.get(roomCode);
    if (!state) return { error: '房间不存在' };

    const game = state.room.currentGame;
    if (!game) return { error: '没有进行中的对局' };

    const removed = undoLastHand(game);
    if (!removed) return { error: '没有可撤销的记录 (No hands to undo)' };
    this.touch(roomCode);

    return game;
  }

  editHand(roomCode: string, handNumber: number, newInput: HandResultInput): Game | { error: string } {
    const state = this.rooms.get(roomCode);
    if (!state) return { error: '房间不存在' };

    const game = state.room.currentGame;
    if (!game) return { error: '没有进行中的对局' };

    const success = editHand(game, handNumber, newInput);
    if (!success) return { error: '无法编辑该手牌 (Cannot edit hand)' };

    // If game ended as a result of the edit
    if (game.status === 'completed') {
      state.room.status = 'finished';
    }

    this.touch(roomCode);
    return game;
  }

  recordGamePenalty(roomCode: string, input: PenaltyInput): { penalty: Penalty; game: Game } | { error: string } {
    const state = this.rooms.get(roomCode);
    if (!state) return { error: '房间不存在' };

    const game = state.room.currentGame;
    if (!game) return { error: '没有进行中的对局' };

    const penalty = recordPenalty(game, input);
    this.touch(roomCode);

    return { penalty, game };
  }

  undoGamePenalty(roomCode: string): Game | { error: string } {
    const state = this.rooms.get(roomCode);
    if (!state) return { error: '房间不存在' };

    const game = state.room.currentGame;
    if (!game) return { error: '没有进行中的对局' };

    const removed = undoLastPenalty(game);
    if (!removed) return { error: '没有可撤销的罚则 (No penalties to undo)' };
    this.touch(roomCode);

    return game;
  }

  endGame(roomCode: string): { game: Game; finalScores: FinalScore[] } | { error: string } {
    const state = this.rooms.get(roomCode);
    if (!state) return { error: '房间不存在' };

    const game = state.room.currentGame;
    if (!game) return { error: '没有进行中的对局' };

    game.status = 'completed';
    const finalScores = calculateFinalScores(
      game.players,
      game.riichiSticks,
      game.ruleset,
      game.penalties,
    );

    state.room.status = 'finished';
    this.touch(roomCode);

    return { game, finalScores };
  }

  getGameFinalScores(roomCode: string): FinalScore[] | null {
    const state = this.rooms.get(roomCode);
    if (!state?.room.currentGame) return null;

    const game = state.room.currentGame;
    return calculateFinalScores(game.players, game.riichiSticks, game.ruleset, game.penalties);
  }

  resetRoom(roomCode: string): Room | null {
    const state = this.rooms.get(roomCode);
    if (!state) return null;

    state.room.currentGame = null;
    state.room.status = 'waiting';
    state.room.players.forEach(p => { p.seatWind = null; p.ready = false; });
    this.touch(roomCode);

    return state.room;
  }

  broadcast(roomCode: string, event: ServerEvent, excludePlayerId?: string): void {
    const state = this.rooms.get(roomCode);
    if (!state) return;

    const data = JSON.stringify(event);
    for (const [playerId, ws] of state.connections) {
      if (playerId === excludePlayerId) continue;
      try {
        ws.send(data);
      } catch {
        // Connection may be closed
        state.connections.delete(playerId);
      }
    }
  }

  unicast(roomCode: string, playerId: string, event: ServerEvent): void {
    const state = this.rooms.get(roomCode);
    if (!state) return;

    const ws = state.connections.get(playerId);
    if (ws) {
      try {
        ws.send(JSON.stringify(event));
      } catch {
        state.connections.delete(playerId);
      }
    }
  }
}

export const roomManager = new RoomManager();
