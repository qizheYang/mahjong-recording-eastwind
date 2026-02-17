import type { WSContext } from 'hono/ws';
import type {
  Room, Player, Game, GamePlayer, Hand, FinalScore,
  HandResultInput, ServerEvent, Ruleset,
} from '@mahjong/shared';
import {
  M_LEAGUE_RULES, WINDS,
  processHandResult, undoLastHand, calculateFinalScores,
} from '@mahjong/shared';
import { nanoid } from 'nanoid';

interface RoomState {
  room: Room;
  connections: Map<string, WSContext>; // playerId -> ws
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

export class RoomManager {
  private rooms = new Map<string, RoomState>();

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
    };

    this.rooms.set(code, { room, connections: new Map() });

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

    return { playerId, room: state.room };
  }

  connectPlayer(roomCode: string, playerId: string, ws: WSContext): Room | null {
    const state = this.rooms.get(roomCode);
    if (!state) return null;

    const player = state.room.players.find(p => p.id === playerId);
    if (!player) return null;

    state.connections.set(playerId, ws);
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

  toggleReady(roomCode: string, playerId: string): { ready: boolean; allReady: boolean } | { error: string } {
    const state = this.rooms.get(roomCode);
    if (!state) return { error: '房间不存在' };
    if (state.room.status !== 'waiting') return { error: '对局已开始' };

    const player = state.room.players.find(p => p.id === playerId);
    if (!player) return { error: '玩家不存在' };

    player.ready = !player.ready;

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

    return state.room.players;
  }

  getRoom(roomCode: string): Room | null {
    return this.rooms.get(roomCode)?.room ?? null;
  }

  startGame(roomCode: string, seatOrder: string[], customRuleset?: Partial<Ruleset>): Game | { error: string } {
    const state = this.rooms.get(roomCode);
    if (!state) return { error: '房间不存在' };
    if (state.room.players.length !== 4) return { error: '需要4位玩家 (Need 4 players)' };

    const ruleset: Ruleset = { ...M_LEAGUE_RULES, ...customRuleset };

    // Assign seats based on seatOrder (array of player IDs)
    const gamePlayers: GamePlayer[] = seatOrder.map((id, i) => {
      const player = state.room.players.find(p => p.id === id)!;
      player.seatWind = WINDS[i];
      return {
        id: player.id,
        name: player.name,
        ...(player.phone ? { phone: player.phone } : {}),
        points: ruleset.startingPoints,
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
    };

    state.room.currentGame = game;
    state.room.status = 'playing';

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

    return { hand, game };
  }

  undoHand(roomCode: string): Game | { error: string } {
    const state = this.rooms.get(roomCode);
    if (!state) return { error: '房间不存在' };

    const game = state.room.currentGame;
    if (!game) return { error: '没有进行中的对局' };

    const removed = undoLastHand(game);
    if (!removed) return { error: '没有可撤销的记录 (No hands to undo)' };

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
    );

    state.room.status = 'finished';

    return { game, finalScores };
  }

  getGameFinalScores(roomCode: string): FinalScore[] | null {
    const state = this.rooms.get(roomCode);
    if (!state?.room.currentGame) return null;

    const game = state.room.currentGame;
    return calculateFinalScores(game.players, game.riichiSticks, game.ruleset);
  }

  resetRoom(roomCode: string): Room | null {
    const state = this.rooms.get(roomCode);
    if (!state) return null;

    state.room.currentGame = null;
    state.room.status = 'waiting';
    state.room.players.forEach(p => { p.seatWind = null; p.ready = false; });

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
