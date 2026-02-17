/**
 * Server Integration Tests
 *
 * These tests spin up the actual Hono server with WebSocket support
 * and simulate real user flows: creating rooms, joining, starting games,
 * recording hands, undoing hands, and completing games.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { serve } from '@hono/node-server';
import { createApp } from '../packages/server/src/app';
import WebSocket from 'ws';
import type { ServerEvent, ClientEvent } from '@mahjong/shared';
import type { Server } from 'http';

let server: Server;
let port: number;
const BASE_PATH = '/mahjong-recording';

/**
 * Buffered WebSocket wrapper that captures all messages from the moment
 * the connection is created, preventing race conditions where the server
 * sends a message during the 'open' event before listeners are attached.
 */
class BufferedWs {
  ws: WebSocket;
  private buffer: ServerEvent[] = [];
  private waiters: { type: string; resolve: (e: ServerEvent) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }[] = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (data: WebSocket.Data) => {
      const event: ServerEvent = JSON.parse(data.toString());
      const idx = this.waiters.findIndex(w => w.type === event.type);
      if (idx >= 0) {
        const waiter = this.waiters.splice(idx, 1)[0];
        clearTimeout(waiter.timer);
        waiter.resolve(event);
      } else {
        this.buffer.push(event);
      }
    });
  }

  waitForOpen(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState === WebSocket.OPEN) return resolve();
      this.ws.on('open', () => resolve());
      this.ws.on('error', reject);
    });
  }

  waitForEvent(type: string, timeoutMs = 5000): Promise<ServerEvent> {
    const idx = this.buffer.findIndex(e => e.type === type);
    if (idx >= 0) {
      return Promise.resolve(this.buffer.splice(idx, 1)[0]);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const wIdx = this.waiters.findIndex(w => w.resolve === resolve);
        if (wIdx >= 0) this.waiters.splice(wIdx, 1);
        reject(new Error(`Timeout waiting for ${type}`));
      }, timeoutMs);
      this.waiters.push({ type, resolve, reject, timer });
    });
  }

  send(event: ClientEvent): void {
    this.ws.send(JSON.stringify(event));
  }

  close(): void {
    this.ws.close();
  }

  get readyState(): number {
    return this.ws.readyState;
  }
}

// Helper: create a buffered WebSocket connection
async function connectWs(roomCode: string, playerId: string): Promise<BufferedWs> {
  const url = `ws://localhost:${port}${BASE_PATH}/ws?roomCode=${roomCode}&playerId=${playerId}`;
  const bws = new BufferedWs(url);
  await bws.waitForOpen();
  return bws;
}

// Helper: HTTP request
async function apiPost(path: string, body: object): Promise<{ status: number; data: any }> {
  const res = await fetch(`http://localhost:${port}${BASE_PATH}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function apiGet(path: string): Promise<{ status: number; data: any }> {
  const res = await fetch(`http://localhost:${port}${BASE_PATH}${path}`);
  const data = await res.json();
  return { status: res.status, data };
}

// Track all WebSockets for cleanup
const openWsSockets: BufferedWs[] = [];

beforeAll(async () => {
  process.env.BASE_PATH = BASE_PATH;
  process.env.NODE_ENV = 'test';

  const { app, injectWebSocket } = createApp();

  await new Promise<void>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0 }, (info) => {
      port = info.port;
      resolve();
    });
    injectWebSocket(server);
  });
});

afterEach(() => {
  for (const bws of openWsSockets) {
    if (bws.readyState === WebSocket.OPEN) {
      bws.close();
    }
  }
  openWsSockets.length = 0;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

function track(bws: BufferedWs): BufferedWs {
  openWsSockets.push(bws);
  return bws;
}

// ──────────────────────────────────────────────────
// REST API Tests
// ──────────────────────────────────────────────────
describe('REST API', () => {
  it('health check responds', async () => {
    const { status, data } = await apiGet('/api/health');
    expect(status).toBe(200);
    expect(data.status).toBe('ok');
  });

  it('create room returns roomCode and playerId', async () => {
    const { status, data } = await apiPost('/api/rooms', { playerName: '太郎' });
    expect(status).toBe(200);
    expect(data.roomCode).toMatch(/^[A-Z0-9]{4}$/);
    expect(data.playerId).toBeTruthy();
  });

  it('join room returns playerId', async () => {
    const create = await apiPost('/api/rooms', { playerName: 'Host' });
    const code = create.data.roomCode;

    const join = await apiPost(`/api/rooms/${code}/join`, { playerName: 'Guest' });
    expect(join.status).toBe(200);
    expect(join.data.playerId).toBeTruthy();
    expect(join.data.roomCode).toBe(code);
  });

  it('get room returns room state', async () => {
    const create = await apiPost('/api/rooms', { playerName: 'Alice' });
    const code = create.data.roomCode;

    const { status, data } = await apiGet(`/api/rooms/${code}`);
    expect(status).toBe(200);
    expect(data.room.code).toBe(code);
    expect(data.room.players).toHaveLength(1);
    expect(data.room.players[0].name).toBe('Alice');
  });

  it('cannot join full room', async () => {
    const create = await apiPost('/api/rooms', { playerName: 'P1' });
    const code = create.data.roomCode;
    await apiPost(`/api/rooms/${code}/join`, { playerName: 'P2' });
    await apiPost(`/api/rooms/${code}/join`, { playerName: 'P3' });
    await apiPost(`/api/rooms/${code}/join`, { playerName: 'P4' });

    const full = await apiPost(`/api/rooms/${code}/join`, { playerName: 'P5' });
    expect(full.status).toBe(400);
  });

  it('cannot join non-existent room', async () => {
    const res = await apiPost('/api/rooms/ZZZZ/join', { playerName: 'Lost' });
    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────────
// WebSocket Connection Tests
// ──────────────────────────────────────────────────
describe('WebSocket Connection', () => {
  it('connects and receives room_state', async () => {
    const create = await apiPost('/api/rooms', { playerName: 'Alice' });
    const { roomCode, playerId } = create.data;

    const ws = track(await connectWs(roomCode, playerId));
    const event = await ws.waitForEvent('room_state');

    expect(event.type).toBe('room_state');
    if (event.type === 'room_state') {
      expect(event.room.code).toBe(roomCode);
      expect(event.room.players).toHaveLength(1);
    }
  });

  it('second player gets player_joined notification', async () => {
    const create = await apiPost('/api/rooms', { playerName: 'Alice' });
    const code = create.data.roomCode;
    const join = await apiPost(`/api/rooms/${code}/join`, { playerName: 'Bob' });

    // Alice connects
    const ws1 = track(await connectWs(code, create.data.playerId));
    await ws1.waitForEvent('room_state');

    // Bob connects - Alice should get player_joined
    const joinedPromise = ws1.waitForEvent('player_joined');
    const ws2 = track(await connectWs(code, join.data.playerId));
    await ws2.waitForEvent('room_state');

    const joined = await joinedPromise;
    if (joined.type === 'player_joined') {
      expect(joined.player.name).toBe('Bob');
    }
  });
});

// ──────────────────────────────────────────────────
// Full Game Flow (4 Players)
// ──────────────────────────────────────────────────
describe('Full Game Flow', () => {
  let roomCode: string;
  let playerIds: string[];
  let sockets: BufferedWs[];

  async function setupRoom(): Promise<void> {
    const names = ['东风', '南风', '西风', '北风'];
    playerIds = [];

    const create = await apiPost('/api/rooms', { playerName: names[0] });
    roomCode = create.data.roomCode;
    playerIds.push(create.data.playerId);

    for (let i = 1; i < 4; i++) {
      const join = await apiPost(`/api/rooms/${roomCode}/join`, { playerName: names[i] });
      playerIds.push(join.data.playerId);
    }

    // Connect all 4 players via WebSocket
    sockets = [];
    for (const pid of playerIds) {
      const ws = track(await connectWs(roomCode, pid));
      await ws.waitForEvent('room_state');
      sockets.push(ws);
    }
  }

  it('4 players join, start game, record hands, game ends naturally', async () => {
    await setupRoom();

    // Start game - player 0 sends start_game
    const gameStartedPromises = sockets.map(ws => ws.waitForEvent('game_started'));
    sockets[0].send({ type: 'start_game', seatOrder: playerIds });
    const gameEvents = await Promise.all(gameStartedPromises);

    for (const evt of gameEvents) {
      expect(evt.type).toBe('game_started');
      if (evt.type === 'game_started') {
        expect(evt.game.status).toBe('in_progress');
        expect(evt.game.players).toHaveLength(4);
        expect(evt.game.currentRound).toEqual({ wind: 'east', number: 1 });
      }
    }

    // Record 7 hands (East 1-4, South 1-3): non-dealer wins each time
    for (let i = 0; i < 7; i++) {
      const dealerIdx = i % 4;
      const winnerIdx = (dealerIdx + 1) % 4;

      const recordedPromises = sockets.map(ws => ws.waitForEvent('hand_recorded'));
      sockets[0].send({
        type: 'record_hand',
        result: {
          resultType: 'agari',
          winnerIndex: winnerIdx,
          loserIndex: dealerIdx,
          isTsumo: false,
          han: 1,
          fu: 30,
        },
      });
      const recordedEvents = await Promise.all(recordedPromises);

      for (const evt of recordedEvents) {
        expect(evt.type).toBe('hand_recorded');
      }
    }

    // Record 8th hand (South 4 = All Last): non-dealer wins → game should end
    const endPromises = sockets.map(ws => ws.waitForEvent('game_ended'));
    sockets[0].send({
      type: 'record_hand',
      result: {
        resultType: 'agari',
        winnerIndex: 0,
        loserIndex: 3,
        isTsumo: false,
        han: 1,
        fu: 30,
      },
    });
    const endEvents = await Promise.all(endPromises);

    for (const evt of endEvents) {
      expect(evt.type).toBe('game_ended');
      if (evt.type === 'game_ended') {
        expect(evt.game.status).toBe('completed');
        expect(evt.finalScores).toHaveLength(4);
        const totalGameScore = evt.finalScores.reduce((s, f) => s + f.gameScore, 0);
        expect(Math.abs(totalGameScore)).toBeLessThan(0.1);
      }
    }
  });

  it('undo hand restores previous state', async () => {
    await setupRoom();

    const startPromises = sockets.map(ws => ws.waitForEvent('game_started'));
    sockets[0].send({ type: 'start_game', seatOrder: playerIds });
    await Promise.all(startPromises);

    const recordedPromises = sockets.map(ws => ws.waitForEvent('hand_recorded'));
    sockets[0].send({
      type: 'record_hand',
      result: {
        resultType: 'agari', winnerIndex: 1, loserIndex: 0,
        isTsumo: false, han: 3, fu: 30,
      },
    });
    await Promise.all(recordedPromises);

    const undoPromises = sockets.map(ws => ws.waitForEvent('hand_undone'));
    sockets[0].send({ type: 'undo_last_hand' });
    const undoEvents = await Promise.all(undoPromises);

    for (const evt of undoEvents) {
      expect(evt.type).toBe('hand_undone');
      if (evt.type === 'hand_undone') {
        expect(evt.game.currentRound).toEqual({ wind: 'east', number: 1 });
        expect(evt.game.hands).toHaveLength(0);
        for (const p of evt.game.players) {
          expect(p.points).toBe(25000);
        }
      }
    }
  });

  it('manual end game works', async () => {
    await setupRoom();

    const startPromises = sockets.map(ws => ws.waitForEvent('game_started'));
    sockets[0].send({ type: 'start_game', seatOrder: playerIds });
    await Promise.all(startPromises);

    for (let i = 0; i < 2; i++) {
      const p = sockets.map(ws => ws.waitForEvent('hand_recorded'));
      sockets[0].send({
        type: 'record_hand',
        result: {
          resultType: 'agari', winnerIndex: (i + 1) % 4, loserIndex: i % 4,
          isTsumo: false, han: 2, fu: 30,
        },
      });
      await Promise.all(p);
    }

    const endPromises = sockets.map(ws => ws.waitForEvent('game_ended'));
    sockets[0].send({ type: 'end_game' });
    const endEvents = await Promise.all(endPromises);

    for (const evt of endEvents) {
      expect(evt.type).toBe('game_ended');
      if (evt.type === 'game_ended') {
        expect(evt.game.status).toBe('completed');
        expect(evt.finalScores).toHaveLength(4);
      }
    }
  });

  it('any player can record hands (not just host)', async () => {
    await setupRoom();

    const startPromises = sockets.map(ws => ws.waitForEvent('game_started'));
    sockets[0].send({ type: 'start_game', seatOrder: playerIds });
    await Promise.all(startPromises);

    // Player 2 (index 2) records a hand
    const recordedPromises = sockets.map(ws => ws.waitForEvent('hand_recorded'));
    sockets[2].send({
      type: 'record_hand',
      result: {
        resultType: 'agari', winnerIndex: 3, loserIndex: 0,
        isTsumo: false, han: 1, fu: 30,
      },
    });
    const events = await Promise.all(recordedPromises);
    expect(events).toHaveLength(4);
    for (const evt of events) {
      expect(evt.type).toBe('hand_recorded');
    }

    // Player 3 records another
    const recordedPromises2 = sockets.map(ws => ws.waitForEvent('hand_recorded'));
    sockets[3].send({
      type: 'record_hand',
      result: {
        resultType: 'ryuukyoku', tenpaiStatus: [true, true, false, false],
      },
    });
    const events2 = await Promise.all(recordedPromises2);
    expect(events2).toHaveLength(4);
  });

  it('handles dealer renchan correctly', async () => {
    await setupRoom();

    const startPromises = sockets.map(ws => ws.waitForEvent('game_started'));
    sockets[0].send({ type: 'start_game', seatOrder: playerIds });
    await Promise.all(startPromises);

    // Dealer (idx 0) wins → renchan
    let recordedPromises = sockets.map(ws => ws.waitForEvent('hand_recorded'));
    sockets[0].send({
      type: 'record_hand',
      result: {
        resultType: 'agari', winnerIndex: 0, loserIndex: 1,
        isTsumo: false, han: 2, fu: 30,
      },
    });
    let events = await Promise.all(recordedPromises);

    for (const evt of events) {
      if (evt.type === 'hand_recorded') {
        expect(evt.game.currentRound).toEqual({ wind: 'east', number: 1 });
        expect(evt.game.currentDealer).toBe(0);
        expect(evt.game.honbaCount).toBe(1);
      }
    }

    // Dealer wins again → honba increases
    recordedPromises = sockets.map(ws => ws.waitForEvent('hand_recorded'));
    sockets[0].send({
      type: 'record_hand',
      result: {
        resultType: 'agari', winnerIndex: 0, loserIndex: 2,
        isTsumo: false, han: 1, fu: 30,
      },
    });
    events = await Promise.all(recordedPromises);

    for (const evt of events) {
      if (evt.type === 'hand_recorded') {
        expect(evt.game.honbaCount).toBe(2);
      }
    }
  });

  it('handles tsumo with correct payments', async () => {
    await setupRoom();

    const startPromises = sockets.map(ws => ws.waitForEvent('game_started'));
    sockets[0].send({ type: 'start_game', seatOrder: playerIds });
    await Promise.all(startPromises);

    // Non-dealer (idx 2) tsumos mangan
    const recordedPromises = sockets.map(ws => ws.waitForEvent('hand_recorded'));
    sockets[0].send({
      type: 'record_hand',
      result: {
        resultType: 'agari', winnerIndex: 2, isTsumo: true,
        han: 5, fu: 30,
      },
    });
    const events = await Promise.all(recordedPromises);

    for (const evt of events) {
      if (evt.type === 'hand_recorded') {
        const players = evt.game.players;
        expect(players[0].points).toBe(25000 - 4000);
        expect(players[1].points).toBe(25000 - 2000);
        expect(players[2].points).toBe(25000 + 8000);
        expect(players[3].points).toBe(25000 - 2000);
      }
    }
  });

  it('handles ryuukyoku correctly', async () => {
    await setupRoom();

    const startPromises = sockets.map(ws => ws.waitForEvent('game_started'));
    sockets[0].send({ type: 'start_game', seatOrder: playerIds });
    await Promise.all(startPromises);

    const recordedPromises = sockets.map(ws => ws.waitForEvent('hand_recorded'));
    sockets[0].send({
      type: 'record_hand',
      result: {
        resultType: 'ryuukyoku',
        tenpaiStatus: [true, true, false, false],
      },
    });
    const events = await Promise.all(recordedPromises);

    for (const evt of events) {
      if (evt.type === 'hand_recorded') {
        const players = evt.game.players;
        expect(players[0].points).toBe(25000 + 1500);
        expect(players[1].points).toBe(25000 + 1500);
        expect(players[2].points).toBe(25000 - 1500);
        expect(players[3].points).toBe(25000 - 1500);
        expect(evt.game.currentRound).toEqual({ wind: 'east', number: 1 });
        expect(evt.game.honbaCount).toBe(1);
      }
    }
  });

  it('WebSocket reconnection: player reconnects and gets current state', async () => {
    await setupRoom();

    const startPromises = sockets.map(ws => ws.waitForEvent('game_started'));
    sockets[0].send({ type: 'start_game', seatOrder: playerIds });
    await Promise.all(startPromises);

    const recordedPromises = sockets.map(ws => ws.waitForEvent('hand_recorded'));
    sockets[0].send({
      type: 'record_hand',
      result: {
        resultType: 'agari', winnerIndex: 1, loserIndex: 0,
        isTsumo: false, han: 2, fu: 30,
      },
    });
    await Promise.all(recordedPromises);

    // Player 2 disconnects and reconnects
    sockets[2].close();
    await new Promise(r => setTimeout(r, 100));

    const ws2new = track(await connectWs(roomCode, playerIds[2]));
    const stateEvent = await ws2new.waitForEvent('room_state');

    if (stateEvent.type === 'room_state') {
      expect(stateEvent.room.currentGame).not.toBeNull();
      expect(stateEvent.room.currentGame!.hands).toHaveLength(1);
      expect(stateEvent.room.currentGame!.currentRound).toEqual({ wind: 'east', number: 2 });
    }
  });
});

// ──────────────────────────────────────────────────
// Edge Cases
// ──────────────────────────────────────────────────
describe('Edge Cases', () => {
  it('cannot start game with fewer than 4 players', async () => {
    const create = await apiPost('/api/rooms', { playerName: 'Solo' });
    const { roomCode, playerId } = create.data;

    const ws = track(await connectWs(roomCode, playerId));
    await ws.waitForEvent('room_state');

    const errorPromise = ws.waitForEvent('error');
    ws.send({ type: 'start_game', seatOrder: [playerId] });
    const err = await errorPromise;

    expect(err.type).toBe('error');
  });

  it('ready toggle broadcasts to all players and auto-starts game', async () => {
    const names = ['A', 'B', 'C', 'D'];
    const playerIds: string[] = [];

    const create = await apiPost('/api/rooms', { playerName: names[0] });
    const code = create.data.roomCode;
    playerIds.push(create.data.playerId);

    for (let i = 1; i < 4; i++) {
      const join = await apiPost(`/api/rooms/${code}/join`, { playerName: names[i] });
      playerIds.push(join.data.playerId);
    }

    const sockets: BufferedWs[] = [];
    for (const pid of playerIds) {
      const ws = track(await connectWs(code, pid));
      await ws.waitForEvent('room_state');
      sockets.push(ws);
    }

    // Player 0 toggles ready
    const readyPromises0 = sockets.map(ws => ws.waitForEvent('player_ready'));
    sockets[0].send({ type: 'ready_toggle' });
    const readyEvents0 = await Promise.all(readyPromises0);
    for (const evt of readyEvents0) {
      if (evt.type === 'player_ready') {
        expect(evt.playerId).toBe(playerIds[0]);
        expect(evt.ready).toBe(true);
      }
    }

    // Players 1 and 2 toggle ready
    for (let i = 1; i <= 2; i++) {
      const readyP = sockets.map(ws => ws.waitForEvent('player_ready'));
      sockets[i].send({ type: 'ready_toggle' });
      await Promise.all(readyP);
    }

    // Player 3 toggles ready → all 4 ready → game auto-starts
    const gameStartedPromises = sockets.map(ws => ws.waitForEvent('game_started'));
    // Also expect player_ready before game_started
    const readyPromises3 = sockets.map(ws => ws.waitForEvent('player_ready'));
    sockets[3].send({ type: 'ready_toggle' });
    await Promise.all(readyPromises3);
    const gameEvents = await Promise.all(gameStartedPromises);

    for (const evt of gameEvents) {
      expect(evt.type).toBe('game_started');
      if (evt.type === 'game_started') {
        expect(evt.game.status).toBe('in_progress');
        expect(evt.game.players).toHaveLength(4);
      }
    }
  });

  it('ready toggle can be cancelled', async () => {
    const create = await apiPost('/api/rooms', { playerName: 'Toggler' });
    const code = create.data.roomCode;
    for (let i = 0; i < 3; i++) {
      await apiPost(`/api/rooms/${code}/join`, { playerName: `P${i + 2}` });
    }

    const ws = track(await connectWs(code, create.data.playerId));
    await ws.waitForEvent('room_state');

    // Toggle on
    ws.send({ type: 'ready_toggle' });
    const on = await ws.waitForEvent('player_ready');
    if (on.type === 'player_ready') {
      expect(on.ready).toBe(true);
    }

    // Toggle off
    ws.send({ type: 'ready_toggle' });
    const off = await ws.waitForEvent('player_ready');
    if (off.type === 'player_ready') {
      expect(off.ready).toBe(false);
    }
  });

  it('swap seats reorders players and resets ready state', async () => {
    const names = ['Alice', 'Bob', 'Charlie', 'Diana'];
    const playerIds: string[] = [];

    const create = await apiPost('/api/rooms', { playerName: names[0] });
    const code = create.data.roomCode;
    playerIds.push(create.data.playerId);

    for (let i = 1; i < 4; i++) {
      const join = await apiPost(`/api/rooms/${code}/join`, { playerName: names[i] });
      playerIds.push(join.data.playerId);
    }

    const sockets: BufferedWs[] = [];
    for (const pid of playerIds) {
      const ws = track(await connectWs(code, pid));
      await ws.waitForEvent('room_state');
      sockets.push(ws);
    }

    // Player 0 readies up first
    const readyPromises = sockets.map(ws => ws.waitForEvent('player_ready'));
    sockets[0].send({ type: 'ready_toggle' });
    await Promise.all(readyPromises);

    // Now swap player 0 and player 2 — should reset everyone's ready state
    const swapPromises = sockets.map(ws => ws.waitForEvent('seats_swapped'));
    sockets[1].send({ type: 'swap_seats', playerIdA: playerIds[0], playerIdB: playerIds[2] });
    const swapEvents = await Promise.all(swapPromises);

    for (const evt of swapEvents) {
      expect(evt.type).toBe('seats_swapped');
      if (evt.type === 'seats_swapped') {
        // Players should be reordered: Charlie, Bob, Alice, Diana
        expect(evt.players[0].name).toBe('Charlie');
        expect(evt.players[1].name).toBe('Bob');
        expect(evt.players[2].name).toBe('Alice');
        expect(evt.players[3].name).toBe('Diana');
        // All ready states should be reset
        for (const p of evt.players) {
          expect(p.ready).toBe(false);
        }
      }
    }
  });

  it('swap seats during game is rejected', async () => {
    const names = ['A', 'B', 'C', 'D'];
    const playerIds: string[] = [];

    const create = await apiPost('/api/rooms', { playerName: names[0] });
    const code = create.data.roomCode;
    playerIds.push(create.data.playerId);

    for (let i = 1; i < 4; i++) {
      const join = await apiPost(`/api/rooms/${code}/join`, { playerName: names[i] });
      playerIds.push(join.data.playerId);
    }

    const sockets: BufferedWs[] = [];
    for (const pid of playerIds) {
      const ws = track(await connectWs(code, pid));
      await ws.waitForEvent('room_state');
      sockets.push(ws);
    }

    // Start game directly
    const startPromises = sockets.map(ws => ws.waitForEvent('game_started'));
    sockets[0].send({ type: 'start_game', seatOrder: playerIds });
    await Promise.all(startPromises);

    // Try to swap — should get error
    const errorPromise = sockets[0].waitForEvent('error');
    sockets[0].send({ type: 'swap_seats', playerIdA: playerIds[0], playerIdB: playerIds[1] });
    const err = await errorPromise;
    expect(err.type).toBe('error');
  });

  it('swap seats then ready system works to start game', async () => {
    const names = ['East', 'South', 'West', 'North'];
    const playerIds: string[] = [];

    const create = await apiPost('/api/rooms', { playerName: names[0] });
    const code = create.data.roomCode;
    playerIds.push(create.data.playerId);

    for (let i = 1; i < 4; i++) {
      const join = await apiPost(`/api/rooms/${code}/join`, { playerName: names[i] });
      playerIds.push(join.data.playerId);
    }

    const sockets: BufferedWs[] = [];
    for (const pid of playerIds) {
      const ws = track(await connectWs(code, pid));
      await ws.waitForEvent('room_state');
      sockets.push(ws);
    }

    // Swap player 0 and 3 (East <-> North)
    const swapPromises = sockets.map(ws => ws.waitForEvent('seats_swapped'));
    sockets[0].send({ type: 'swap_seats', playerIdA: playerIds[0], playerIdB: playerIds[3] });
    const swapEvents = await Promise.all(swapPromises);

    // Verify new order: North, South, West, East
    if (swapEvents[0].type === 'seats_swapped') {
      expect(swapEvents[0].players[0].name).toBe('North');
      expect(swapEvents[0].players[3].name).toBe('East');
    }

    // All 4 players ready up after swap
    for (let i = 0; i < 3; i++) {
      const rp = sockets.map(ws => ws.waitForEvent('player_ready'));
      sockets[i].send({ type: 'ready_toggle' });
      await Promise.all(rp);
    }

    // Last player readies → game auto-starts
    const gameStartedPromises = sockets.map(ws => ws.waitForEvent('game_started'));
    const lastReadyPromises = sockets.map(ws => ws.waitForEvent('player_ready'));
    sockets[3].send({ type: 'ready_toggle' });
    await Promise.all(lastReadyPromises);
    const gameEvents = await Promise.all(gameStartedPromises);

    for (const evt of gameEvents) {
      if (evt.type === 'game_started') {
        // Game should start with swapped order: North is East seat
        expect(evt.game.players[0].name).toBe('North');
        expect(evt.game.players[0].initialSeat).toBe('east');
        expect(evt.game.players[3].name).toBe('East');
        expect(evt.game.players[3].initialSeat).toBe('north');
      }
    }
  });

  it('game history list and detail API works', async () => {
    // Create and complete a game so there are records to query
    const names = ['HistA', 'HistB', 'HistC', 'HistD'];
    const pIds: string[] = [];

    const cr = await apiPost('/api/rooms', { playerName: names[0] });
    const code = cr.data.roomCode;
    pIds.push(cr.data.playerId);

    for (let i = 1; i < 4; i++) {
      const j = await apiPost(`/api/rooms/${code}/join`, { playerName: names[i] });
      pIds.push(j.data.playerId);
    }

    const socks: BufferedWs[] = [];
    for (const pid of pIds) {
      const ws = track(await connectWs(code, pid));
      await ws.waitForEvent('room_state');
      socks.push(ws);
    }

    const startP = socks.map(ws => ws.waitForEvent('game_started'));
    socks[0].send({ type: 'start_game', seatOrder: pIds });
    await Promise.all(startP);

    const recP = socks.map(ws => ws.waitForEvent('hand_recorded'));
    socks[0].send({
      type: 'record_hand',
      result: { resultType: 'agari', winnerIndex: 1, loserIndex: 0, isTsumo: false, han: 3, fu: 30 },
    });
    await Promise.all(recP);

    const endP = socks.map(ws => ws.waitForEvent('game_ended'));
    socks[0].send({ type: 'end_game' });
    await Promise.all(endP);

    // Test list endpoint
    const listRes = await apiGet('/api/games');
    expect(listRes.status).toBe(200);
    expect(listRes.data.games.length).toBeGreaterThan(0);

    const game = listRes.data.games[0];
    expect(game.filename).toBeTruthy();
    expect(game.date).toBeTruthy();
    expect(game.roomCode).toBeTruthy();

    // Test detail endpoint
    const detailRes = await apiGet(`/api/games/${game.filename}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.data.players).toHaveLength(4);
    expect(detailRes.data.finalScores).toHaveLength(4);
    expect(detailRes.data.hands.length).toBeGreaterThan(0);
    expect(detailRes.data.totalHands).toBe(detailRes.data.hands.length);

    // Test 404 for non-existent
    const notFound = await fetch(`http://localhost:${port}${BASE_PATH}/api/games/nonexistent.json`);
    expect(notFound.status).toBe(404);
  });

  it('CJK player names work in room creation and joining', async () => {
    const create = await apiPost('/api/rooms', { playerName: '田中太郎' });
    expect(create.status).toBe(200);
    const code = create.data.roomCode;

    const join1 = await apiPost(`/api/rooms/${code}/join`, { playerName: '佐藤花子' });
    expect(join1.status).toBe(200);
    const join2 = await apiPost(`/api/rooms/${code}/join`, { playerName: '李明' });
    expect(join2.status).toBe(200);
    const join3 = await apiPost(`/api/rooms/${code}/join`, { playerName: '김철수' });
    expect(join3.status).toBe(200);

    const room = await apiGet(`/api/rooms/${code}`);
    expect(room.data.room.players).toHaveLength(4);
    expect(room.data.room.players.map((p: any) => p.name)).toEqual([
      '田中太郎', '佐藤花子', '李明', '김철수',
    ]);
  });
});
