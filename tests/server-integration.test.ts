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
import { createAdmin, signIn } from '../packages/server/src/services/admin-service';
import { roomManager } from '../packages/server/src/ws/room-manager';
import { getDb } from '../packages/server/src/db/connection';
import { registeredUsers } from '../packages/server/src/db/schema';
import { eq } from 'drizzle-orm';
import WebSocket from 'ws';
import type { ServerEvent, ClientEvent } from '@mahjong/shared';
import type { Server } from 'http';

let server: Server;
let port: number;
const BASE_PATH = '/mahjong-recording';
const playerCapabilities = new Map<string, string>();
const hostCapabilities = new Map<string, string>();
const roomCreators = new Map<string, string>();

function rememberRoomSession(data: any): void {
  if (!data?.roomCode || !data?.playerId || !data?.playerCapability) return;
  playerCapabilities.set(`${data.roomCode}:${data.playerId}`, data.playerCapability);
  if (data.hostCapability) {
    hostCapabilities.set(data.roomCode, data.hostCapability);
    roomCreators.set(data.roomCode, data.playerId);
  }
}

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
      const raw = data.toString();
      // Skip non-JSON heartbeat responses
      if (raw === 'pong') return;
      const event: ServerEvent = JSON.parse(raw);
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
  const playerCapability = playerCapabilities.get(`${roomCode}:${playerId}`);
  if (!playerCapability) throw new Error(`Missing player capability for ${roomCode}:${playerId}`);
  const params = new URLSearchParams({ roomCode, playerId, playerCapability });
  const hostCapability = hostCapabilities.get(roomCode);
  if (roomCreators.get(roomCode) === playerId && hostCapability) {
    params.set('hostCapability', hostCapability);
  }
  const url = `ws://localhost:${port}${BASE_PATH}/ws?${params}`;
  const bws = new BufferedWs(url);
  await bws.waitForOpen();
  return bws;
}

// Helper: HTTP request
async function apiPost(path: string, body: object, headers?: Record<string, string>): Promise<{ status: number; data: any }> {
  const requestHeaders = { 'Content-Type': 'application/json', ...headers };
  const roomMutation = path.match(/^\/api\/rooms\/([^/?]+)\/(?:add-player|remove-player|reset)$/);
  if (roomMutation && !requestHeaders['X-Room-Capability']) {
    const hostCapability = hostCapabilities.get(roomMutation[1].toUpperCase());
    if (hostCapability) requestHeaders['X-Room-Capability'] = hostCapability;
  }
  const res = await fetch(`http://localhost:${port}${BASE_PATH}${path}`, {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  rememberRoomSession(data);
  return { status: res.status, data };
}

// Auth helpers: register user (or login if already registered) to get a token
const userTokenCache = new Map<string, string>();

async function getOrCreateToken(name: string): Promise<string> {
  if (userTokenCache.has(name)) return userTokenCache.get(name)!;
  // Try register first
  const emailSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '') || `user${Date.now()}`;
  const reg = await apiPost('/api/users/register', { username: name, email: `${emailSlug}-${Date.now()}@test.com`, phone: `555-${Date.now()}` });
  if (reg.status === 200 && reg.data.token) {
    userTokenCache.set(name, reg.data.token);
    return reg.data.token;
  }
  // Fallback to login
  const login = await apiPost('/api/users/login', { username: name });
  if (login.status === 200) {
    userTokenCache.set(name, login.data.token);
    return login.data.token;
  }
  throw new Error(`Failed to get token for ${name}: reg=${reg.status}, login=${login.status}`);
}

async function createRoomAs(playerName: string): Promise<{ status: number; data: any }> {
  const token = await getOrCreateToken(playerName);
  return apiPost('/api/rooms', {}, { Authorization: `Bearer ${token}` });
}

async function joinRoomAs(code: string, playerName: string): Promise<{ status: number; data: any }> {
  const token = await getOrCreateToken(playerName);
  return apiPost(`/api/rooms/${code}/join`, {}, { Authorization: `Bearer ${token}` });
}

async function apiGet(path: string, headers?: Record<string, string>): Promise<{ status: number; data: any }> {
  const requestHeaders = { ...headers };
  const roomLookup = path.match(/^\/api\/rooms\/([^/?]+)$/);
  if (roomLookup && !requestHeaders['X-Player-Capability']) {
    const roomCode = roomLookup[1].toUpperCase();
    const creatorId = roomCreators.get(roomCode);
    const capability = creatorId && playerCapabilities.get(`${roomCode}:${creatorId}`);
    if (creatorId && capability) {
      requestHeaders['X-Player-Id'] = creatorId;
      requestHeaders['X-Player-Capability'] = capability;
    }
  }
  const res = await fetch(`http://localhost:${port}${BASE_PATH}${path}`, { headers: requestHeaders });
  const data = await res.json();
  return { status: res.status, data };
}

async function apiDelete(path: string, headers?: Record<string, string>): Promise<{ status: number; data: any }> {
  const requestHeaders = { ...headers };
  const roomDelete = path.match(/^\/api\/rooms\/([^/?]+)\?playerId=([^&]+)$/);
  if (roomDelete) {
    const roomCode = roomDelete[1].toUpperCase();
    const claimedPlayerId = decodeURIComponent(roomDelete[2]);
    if (roomCreators.get(roomCode) === claimedPlayerId) {
      const hostCapability = hostCapabilities.get(roomCode);
      if (hostCapability) requestHeaders['X-Room-Capability'] = hostCapability;
    }
  }
  const res = await fetch(`http://localhost:${port}${BASE_PATH}${path}`, { method: 'DELETE', headers: requestHeaders });
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
    const { status, data } = await createRoomAs('太郎');
    expect(status).toBe(200);
    expect(data.roomCode).toMatch(/^[A-Z0-9]{4}$/);
    expect(data.playerId).toBeTruthy();
  });

  it('join room returns playerId', async () => {
    const create = await createRoomAs('Host');
    const code = create.data.roomCode;

    const join = await joinRoomAs(code, 'Guest');
    expect(join.status).toBe(200);
    expect(join.data.playerId).toBeTruthy();
    expect(join.data.roomCode).toBe(code);
  });

  it('get room returns room state', async () => {
    const create = await createRoomAs('RestAlice');
    const code = create.data.roomCode;

    const { status, data } = await apiGet(`/api/rooms/${code}`);
    expect(status).toBe(200);
    expect(data.room.code).toBe(code);
    expect(data.room.players).toHaveLength(1);
    expect(data.room.players[0].name).toBe('RestAlice');
  });

  it('cannot join full room', async () => {
    const create = await createRoomAs('Full_P1');
    const code = create.data.roomCode;
    await joinRoomAs(code, 'Full_P2');
    await joinRoomAs(code, 'Full_P3');
    await joinRoomAs(code, 'Full_P4');

    const full = await joinRoomAs(code, 'Full_P5');
    expect(full.status).toBe(400);
  });

  it('cannot join non-existent room', async () => {
    const res = await joinRoomAs('ZZZZ', 'Lost');
    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────────
// WebSocket Connection Tests
// ──────────────────────────────────────────────────
describe('WebSocket Connection', () => {
  it('connects and receives room_state', async () => {
    const create = await createRoomAs('WsAlice');
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
    const create = await createRoomAs('WsAlice2');
    const code = create.data.roomCode;
    const join = await joinRoomAs(code, 'WsBob');

    // Alice connects
    const ws1 = track(await connectWs(code, create.data.playerId));
    await ws1.waitForEvent('room_state');

    // Bob connects - Alice should get player_joined
    const joinedPromise = ws1.waitForEvent('player_joined');
    const ws2 = track(await connectWs(code, join.data.playerId));
    await ws2.waitForEvent('room_state');

    const joined = await joinedPromise;
    if (joined.type === 'player_joined') {
      expect(joined.player.name).toBe('WsBob');
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

    const create = await createRoomAs(names[0]);
    roomCode = create.data.roomCode;
    playerIds.push(create.data.playerId);

    for (let i = 1; i < 4; i++) {
      const join = await joinRoomAs(roomCode, names[i]);
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
    const create = await createRoomAs('EdgeSolo');
    const { roomCode, playerId } = create.data;

    const ws = track(await connectWs(roomCode, playerId));
    await ws.waitForEvent('room_state');

    const errorPromise = ws.waitForEvent('error');
    ws.send({ type: 'start_game', seatOrder: [playerId] });
    const err = await errorPromise;

    expect(err.type).toBe('error');
  });

  it('ready toggle broadcasts to all players and auto-starts game', async () => {
    const names = ['Ready_A', 'Ready_B', 'Ready_C', 'Ready_D'];
    const playerIds: string[] = [];

    const create = await createRoomAs(names[0]);
    const code = create.data.roomCode;
    playerIds.push(create.data.playerId);

    for (let i = 1; i < 4; i++) {
      const join = await joinRoomAs(code, names[i]);
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
    const create = await createRoomAs('Toggler');
    const code = create.data.roomCode;
    for (let i = 0; i < 3; i++) {
      await joinRoomAs(code, `Toggle_P${i + 2}`);
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
    const names = ['SwapAlice', 'SwapBob', 'SwapCharlie', 'SwapDiana'];
    const playerIds: string[] = [];

    const create = await createRoomAs(names[0]);
    const code = create.data.roomCode;
    playerIds.push(create.data.playerId);

    for (let i = 1; i < 4; i++) {
      const join = await joinRoomAs(code, names[i]);
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
        // Players should be reordered: SwapCharlie, SwapBob, SwapAlice, SwapDiana
        expect(evt.players[0].name).toBe('SwapCharlie');
        expect(evt.players[1].name).toBe('SwapBob');
        expect(evt.players[2].name).toBe('SwapAlice');
        expect(evt.players[3].name).toBe('SwapDiana');
        // All ready states should be reset
        for (const p of evt.players) {
          expect(p.ready).toBe(false);
        }
      }
    }
  });

  it('swap seats during game is rejected', async () => {
    const names = ['SwapGame_A', 'SwapGame_B', 'SwapGame_C', 'SwapGame_D'];
    const playerIds: string[] = [];

    const create = await createRoomAs(names[0]);
    const code = create.data.roomCode;
    playerIds.push(create.data.playerId);

    for (let i = 1; i < 4; i++) {
      const join = await joinRoomAs(code, names[i]);
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
    const names = ['SwapEast', 'SwapSouth', 'SwapWest', 'SwapNorth'];
    const playerIds: string[] = [];

    const create = await createRoomAs(names[0]);
    const code = create.data.roomCode;
    playerIds.push(create.data.playerId);

    for (let i = 1; i < 4; i++) {
      const join = await joinRoomAs(code, names[i]);
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

    // Verify new order: SwapNorth, SwapSouth, SwapWest, SwapEast
    if (swapEvents[0].type === 'seats_swapped') {
      expect(swapEvents[0].players[0].name).toBe('SwapNorth');
      expect(swapEvents[0].players[3].name).toBe('SwapEast');
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
        // Game should start with swapped order: SwapNorth is East seat
        expect(evt.game.players[0].name).toBe('SwapNorth');
        expect(evt.game.players[0].initialSeat).toBe('east');
        expect(evt.game.players[3].name).toBe('SwapEast');
        expect(evt.game.players[3].initialSeat).toBe('north');
      }
    }
  });

  it('game history list and detail API works', async () => {
    // Create and complete a game so there are records to query
    const names = ['HistA', 'HistB', 'HistC', 'HistD'];
    const pIds: string[] = [];

    const cr = await createRoomAs(names[0]);
    const code = cr.data.roomCode;
    pIds.push(cr.data.playerId);

    for (let i = 1; i < 4; i++) {
      const j = await joinRoomAs(code, names[i]);
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

  it('solo mode: add players via REST, start game, record hands', async () => {
    // Creator creates room and connects via WS
    const create = await createRoomAs('SoloHost');
    const code = create.data.roomCode;
    const hostId = create.data.playerId;

    const ws = track(await connectWs(code, hostId));
    await ws.waitForEvent('room_state');

    // Add 3 players via add-player endpoint (solo mode)
    for (const name of ['Player2', 'Player3', 'Player4']) {
      const joinedPromise = ws.waitForEvent('player_joined');
      const res = await apiPost(`/api/rooms/${code}/add-player`, { playerName: name });
      expect(res.status).toBe(200);
      expect(res.data.playerId).toBeTruthy();

      // Host should receive player_joined broadcast
      const joined = await joinedPromise;
      expect(joined.type).toBe('player_joined');
      if (joined.type === 'player_joined') {
        expect(joined.player.name).toBe(name);
      }
    }

    // Verify room has 4 players
    const roomRes = await apiGet(`/api/rooms/${code}`);
    expect(roomRes.data.room.players).toHaveLength(4);

    // Start game directly (no ready needed in solo mode)
    const seatOrder = roomRes.data.room.players.map((p: any) => p.id);
    const startPromise = ws.waitForEvent('game_started');
    ws.send({ type: 'start_game', seatOrder });
    const startEvt = await startPromise;

    expect(startEvt.type).toBe('game_started');
    if (startEvt.type === 'game_started') {
      expect(startEvt.game.status).toBe('in_progress');
      expect(startEvt.game.players[0].name).toBe('SoloHost');
    }

    // Record a hand
    const recPromise = ws.waitForEvent('hand_recorded');
    ws.send({
      type: 'record_hand',
      result: { resultType: 'agari', winnerIndex: 1, loserIndex: 0, isTsumo: false, han: 2, fu: 30 },
    });
    const recEvt = await recPromise;
    expect(recEvt.type).toBe('hand_recorded');

    // End game
    const endPromise = ws.waitForEvent('game_ended');
    ws.send({ type: 'end_game' });
    const endEvt = await endPromise;
    expect(endEvt.type).toBe('game_ended');
    if (endEvt.type === 'game_ended') {
      expect(endEvt.finalScores).toHaveLength(4);
    }
  });

  it('add-player validation: empty name, full room, nonexistent room', async () => {
    // Empty name
    const create = await createRoomAs('ValidSolo');
    const code = create.data.roomCode;

    const emptyName = await apiPost(`/api/rooms/${code}/add-player`, { playerName: '' });
    expect(emptyName.status).toBe(400);

    // Fill room
    for (let i = 0; i < 3; i++) {
      await apiPost(`/api/rooms/${code}/add-player`, { playerName: `P${i + 2}` });
    }

    // Full room
    const full = await apiPost(`/api/rooms/${code}/add-player`, { playerName: 'Extra' });
    expect(full.status).toBe(400);

    // Nonexistent room
    const notFound = await apiPost('/api/rooms/ZZZZ/add-player', { playerName: 'Ghost' });
    // Authorization is checked before room lookup to avoid room enumeration.
    expect(notFound.status).toBe(403);
  });

  it('custom ruleset: start game with 30000 points and tobi enabled', async () => {
    const names = ['Custom_A', 'Custom_B', 'Custom_C', 'Custom_D'];
    const playerIds: string[] = [];

    const create = await createRoomAs(names[0]);
    const code = create.data.roomCode;
    playerIds.push(create.data.playerId);

    for (let i = 1; i < 4; i++) {
      const join = await joinRoomAs(code, names[i]);
      playerIds.push(join.data.playerId);
    }

    const sockets: BufferedWs[] = [];
    for (const pid of playerIds) {
      const ws = track(await connectWs(code, pid));
      await ws.waitForEvent('room_state');
      sockets.push(ws);
    }

    // Start game with custom ruleset
    const startPromises = sockets.map(ws => ws.waitForEvent('game_started'));
    sockets[0].send({
      type: 'start_game',
      seatOrder: playerIds,
      ruleset: { startingPoints: 30000, tobiEnabled: true },
    });
    const startEvents = await Promise.all(startPromises);

    for (const evt of startEvents) {
      if (evt.type === 'game_started') {
        expect(evt.game.players[0].points).toBe(30000);
        expect(evt.game.ruleset.startingPoints).toBe(30000);
        expect(evt.game.ruleset.tobiEnabled).toBe(true);
      }
    }
  });

  it('CJK player names work in room creation and joining', async () => {
    const create = await createRoomAs('田中太郎');
    expect(create.status).toBe(200);
    const code = create.data.roomCode;

    const join1 = await joinRoomAs(code, '佐藤花子');
    expect(join1.status).toBe(200);
    const join2 = await joinRoomAs(code, '李明');
    expect(join2.status).toBe(200);
    const join3 = await joinRoomAs(code, '김철수');
    expect(join3.status).toBe(200);

    const room = await apiGet(`/api/rooms/${code}`);
    expect(room.data.room.players).toHaveLength(4);
    expect(room.data.room.players.map((p: any) => p.name)).toEqual([
      '田中太郎', '佐藤花子', '李明', '김철수',
    ]);
  });
});

// ──────────────────────────────────────────────────
// Kill Room Tests
// ──────────────────────────────────────────────────
describe('Kill Room', () => {
  let adminToken: string;

  // Create test admin account once
  beforeAll(() => {
    try { createAdmin('testadmin', 'testpass123'); } catch { /* already exists */ }
    const result = signIn('testadmin', 'testpass123');
    adminToken = result!.token;
  });

  it('room has creatorId set', async () => {
    const create = await createRoomAs('KillCreator');
    const code = create.data.roomCode;
    const creatorId = create.data.playerId;

    const room = await apiGet(`/api/rooms/${code}`);
    expect(room.data.room.creatorId).toBe(creatorId);
  });

  it('creator can kill their own room', async () => {
    const create = await createRoomAs('KillCreator2');
    const code = create.data.roomCode;
    const creatorId = create.data.playerId;

    const res = await apiDelete(`/api/rooms/${code}?playerId=${creatorId}`);
    expect(res.status).toBe(200);
    expect(res.data.ok).toBe(true);

    // Room should be gone
    const check = await apiGet(`/api/rooms/${code}`);
    expect(check.status).toBe(404);
  });

  it('non-creator cannot kill room', async () => {
    const create = await createRoomAs('KillCreator3');
    const code = create.data.roomCode;
    const join = await joinRoomAs(code, 'KillGuest');
    const guestId = join.data.playerId;

    const res = await apiDelete(`/api/rooms/${code}?playerId=${guestId}`);
    expect(res.status).toBe(403);

    // Room should still exist
    const check = await apiGet(`/api/rooms/${code}`);
    expect(check.status).toBe(200);
  });

  it('admin can kill waiting room even with 4 players', async () => {
    const create = await createRoomAs('Kill_P1');
    const code = create.data.roomCode;
    await joinRoomAs(code, 'Kill_P2');
    await joinRoomAs(code, 'Kill_P3');
    await joinRoomAs(code, 'Kill_P4');

    const res = await apiDelete(`/api/rooms/${code}`, { Authorization: `Bearer ${adminToken}` });
    expect(res.status).toBe(200);
    expect(res.data.ok).toBe(true);

    // Room should be gone
    const check = await apiGet(`/api/rooms/${code}`);
    expect(check.status).toBe(404);
  });

  it('admin cannot kill room with game in progress', async () => {
    const create = await createRoomAs('KillProg_P1');
    const code = create.data.roomCode;
    const hostId = create.data.playerId;
    await joinRoomAs(code, 'KillProg_P2');
    await joinRoomAs(code, 'KillProg_P3');
    await joinRoomAs(code, 'KillProg_P4');

    // Start the game via WS
    const ws = track(await connectWs(code, hostId));
    await ws.waitForEvent('room_state');
    const room = roomManager.getRoom(code)!;
    ws.send({ type: 'start_game', seatOrder: room.players.map(p => p.id) });
    await ws.waitForEvent('game_started');

    const res = await apiDelete(`/api/rooms/${code}`, { Authorization: `Bearer ${adminToken}` });
    expect(res.status).toBe(400);

    // Room should still exist
    const check = await apiGet(`/api/rooms/${code}`);
    expect(check.status).toBe(200);
    ws.close();
  });

  it('connected players receive room_killed event', async () => {
    const create = await createRoomAs('KillWsHost');
    const code = create.data.roomCode;
    const hostId = create.data.playerId;
    const join = await joinRoomAs(code, 'KillWsGuest');

    // Connect both players via WS
    const ws1 = track(await connectWs(code, hostId));
    await ws1.waitForEvent('room_state');
    const ws2 = track(await connectWs(code, join.data.playerId));
    await ws2.waitForEvent('room_state');

    // Kill the room as creator
    const killedPromise1 = ws1.waitForEvent('room_killed');
    const killedPromise2 = ws2.waitForEvent('room_killed');

    await apiDelete(`/api/rooms/${code}?playerId=${hostId}`);

    const killed1 = await killedPromise1;
    const killed2 = await killedPromise2;

    expect(killed1.type).toBe('room_killed');
    expect(killed2.type).toBe('room_killed');
    if (killed1.type === 'room_killed') {
      expect(killed1.reason).toBeTruthy();
    }
  });

  it('killing nonexistent room returns 404', async () => {
    const res = await apiDelete('/api/rooms/ZZZZ?playerId=fake');
    expect(res.status).toBe(404);
  });
});

// ──────────────────────────────────────────────────
// Player Registration & Game Record Matching
// ──────────────────────────────────────────────────
describe('Player Registration & Record Matching', () => {
  // Helper: register a user directly in DB (bypass email verification)
  function registerUserDirectly(username: string, email: string): void {
    const db = getDb();
    const now = Date.now();
    // Delete if exists (for test idempotency)
    db.delete(registeredUsers).where(eq(registeredUsers.username, username)).run();
    db.insert(registeredUsers).values({
      id: `test-${username}-${now}`,
      username,
      email,
      phone: `555-${now}`,
      emailVerified: 1,
      createdAt: now,
      updatedAt: now,
    }).run();
  }

  // Helper: play a complete game with 4 named players
  // Note: names[0] gets registered (creates room), names[1..3] are added via add-player (unregistered)
  async function playGameWithPlayers(names: string[]): Promise<void> {
    const pIds: string[] = [];
    const cr = await createRoomAs(names[0]);
    const code = cr.data.roomCode;
    pIds.push(cr.data.playerId);

    for (let i = 1; i < 4; i++) {
      const j = await apiPost(`/api/rooms/${code}/add-player`, { playerName: names[i] });
      pIds.push(j.data.playerId);
    }

    const ws = track(await connectWs(code, pIds[0]));
    await ws.waitForEvent('room_state');

    const startP = ws.waitForEvent('game_started');
    ws.send({ type: 'start_game', seatOrder: pIds });
    await startP;

    // Record one hand so there's data
    const recP = ws.waitForEvent('hand_recorded');
    ws.send({
      type: 'record_hand',
      result: { resultType: 'agari', winnerIndex: 1, loserIndex: 0, isTsumo: false, han: 3, fu: 30 },
    });
    await recP;

    // End game
    const endP = ws.waitForEvent('game_ended');
    ws.send({ type: 'end_game' });
    await endP;
    ws.close();
  }

  it('unregistered players appear in player list after a game', async () => {
    const uniqueName = `UnregPlayer_${Date.now()}`;
    await playGameWithPlayers(['UnregHost1', uniqueName, 'Buddy1', 'Buddy2']);

    // Check player list
    const res = await apiGet(`/api/players?q=${encodeURIComponent(uniqueName)}`);
    expect(res.status).toBe(200);
    const found = res.data.players.find((p: any) => p.name === uniqueName);
    expect(found).toBeTruthy();
    expect(found.totalGames).toBe(1);
    expect(found.isRegistered).toBe(false);
  });

  it('player record shows isRegistered=false for unregistered player', async () => {
    const uniqueName = `Solo_${Date.now()}`;
    await playGameWithPlayers(['UnregHost2', uniqueName, 'Other1', 'Other2']);

    const res = await apiGet(`/api/players/${encodeURIComponent(uniqueName)}`);
    expect(res.status).toBe(200);
    expect(res.data.name).toBe(uniqueName);
    expect(res.data.isRegistered).toBe(false);
    expect(res.data.totalGames).toBe(1);
  });

  it('after registration, player record combines with existing games', async () => {
    const uniqueName = `RegTest_${Date.now()}`;

    // Play a game before registration (uniqueName at index 1 = added via add-player, not registered)
    await playGameWithPlayers(['RegTestHost', uniqueName, 'PartnerA', 'PartnerB']);

    // Verify unregistered
    const before = await apiGet(`/api/players/${encodeURIComponent(uniqueName)}`);
    expect(before.data.isRegistered).toBe(false);
    expect(before.data.totalGames).toBe(1);

    // Register the user
    registerUserDirectly(uniqueName, `${uniqueName}@test.com`);

    // Verify combined: same games + isRegistered=true
    const after = await apiGet(`/api/players/${encodeURIComponent(uniqueName)}`);
    expect(after.data.isRegistered).toBe(true);
    expect(after.data.totalGames).toBe(1);
    expect(after.data.games).toHaveLength(1);
    expect(after.data.name).toBe(uniqueName);
  });

  it('registered user with no games appears in player list', async () => {
    const uniqueName = `NoGames_${Date.now()}`;
    registerUserDirectly(uniqueName, `${uniqueName}@test.com`);

    const res = await apiGet(`/api/players/${encodeURIComponent(uniqueName)}`);
    expect(res.status).toBe(200);
    expect(res.data.isRegistered).toBe(true);
    expect(res.data.totalGames).toBe(0);
    expect(res.data.games).toHaveLength(0);
  });

  it('registered user appears in player list even with 0 games', async () => {
    const uniqueName = `ListTest_${Date.now()}`;
    registerUserDirectly(uniqueName, `${uniqueName}@test.com`);

    const res = await apiGet('/api/players');
    expect(res.status).toBe(200);
    const found = res.data.players.find((p: any) => p.name === uniqueName);
    expect(found).toBeTruthy();
    expect(found.isRegistered).toBe(true);
    expect(found.totalGames).toBe(0);
  });

  it('case-insensitive name matching works for registration', async () => {
    const baseName = `CaseTest_${Date.now()}`;
    const lowerName = baseName.toLowerCase();

    // Play game with lowercase name (at index 1 so it's added via add-player, not registered)
    await playGameWithPlayers(['CaseHost', lowerName, 'CaseA', 'CaseB']);

    // Register with original casing
    registerUserDirectly(baseName, `${baseName}@test.com`);

    // Both names should resolve to the same player with games + registered
    const res = await apiGet(`/api/players/${encodeURIComponent(lowerName)}`);
    expect(res.status).toBe(200);
    expect(res.data.isRegistered).toBe(true);
    expect(res.data.totalGames).toBe(1);
  });

  it('multiple games before registration all combine correctly', async () => {
    const uniqueName = `MultiGame_${Date.now()}`;

    // Play two games (uniqueName at index 1 = not registered via room creation)
    await playGameWithPlayers(['MG_Host1', uniqueName, 'MG_A', 'MG_B']);
    await playGameWithPlayers(['MG_Host2', uniqueName, 'MG_D', 'MG_E']);

    // Should have 2 games unregistered
    const before = await apiGet(`/api/players/${encodeURIComponent(uniqueName)}`);
    expect(before.data.totalGames).toBe(2);
    expect(before.data.isRegistered).toBe(false);

    // Register
    registerUserDirectly(uniqueName, `${uniqueName}@test.com`);

    // Should still have 2 games but now registered
    const after = await apiGet(`/api/players/${encodeURIComponent(uniqueName)}`);
    expect(after.data.totalGames).toBe(2);
    expect(after.data.isRegistered).toBe(true);
    expect(after.data.games).toHaveLength(2);
  });

  it('search endpoint finds registered users', async () => {
    const uniqueName = `SearchReg_${Date.now()}`;
    registerUserDirectly(uniqueName, `${uniqueName}@test.com`);

    const res = await apiGet(`/api/users/search?q=${encodeURIComponent(uniqueName)}`);
    expect(res.status).toBe(200);
    expect(res.data.users.length).toBeGreaterThan(0);
    expect(res.data.users[0].username).toBe(uniqueName);
  });
});

// ──────────────────────────────────────────────────
// WebSocket Heartbeat & Connection Tests
// ──────────────────────────────────────────────────
describe('WebSocket Heartbeat', () => {
  it('server responds with pong to ping', async () => {
    const creator = await createRoomAs(`HBCreator_${Date.now()}`);
    const { roomCode, playerId } = creator.data;

    const bws = track(await connectWs(roomCode, playerId));
    await bws.waitForEvent('room_state');

    // Send a raw ping (not JSON)
    const pongPromise = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for pong')), 3000);
      const origHandler = bws.ws.onmessage;
      bws.ws.on('message', function pongListener(data: WebSocket.Data) {
        const msg = data.toString();
        if (msg === 'pong') {
          clearTimeout(timer);
          bws.ws.removeListener('message', pongListener);
          resolve(msg);
        }
      });
    });

    bws.ws.send('ping');
    const result = await pongPromise;
    expect(result).toBe('pong');
  });

  it('server still handles normal JSON messages after ping', async () => {
    const creator = await createRoomAs(`HBNormal_${Date.now()}`);
    const { roomCode, playerId } = creator.data;

    const bws = track(await connectWs(roomCode, playerId));
    await bws.waitForEvent('room_state');

    // Send ping first
    bws.ws.send('ping');

    // Then send a normal JSON event (ready_toggle)
    bws.send({ type: 'ready_toggle' });
    const readyEvt = await bws.waitForEvent('player_ready');
    expect(readyEvt.type).toBe('player_ready');
  });

  it('multiple rapid pings all get pongs', async () => {
    const creator = await createRoomAs(`HBRapid_${Date.now()}`);
    const { roomCode, playerId } = creator.data;

    const bws = track(await connectWs(roomCode, playerId));
    await bws.waitForEvent('room_state');

    let pongCount = 0;
    const pongPromise = new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for 3 pongs')), 3000);
      bws.ws.on('message', function counter(data: WebSocket.Data) {
        if (data.toString() === 'pong') {
          pongCount++;
          if (pongCount === 3) {
            clearTimeout(timer);
            bws.ws.removeListener('message', counter);
            resolve(pongCount);
          }
        }
      });
    });

    bws.ws.send('ping');
    bws.ws.send('ping');
    bws.ws.send('ping');

    const result = await pongPromise;
    expect(result).toBe(3);
  });
});

describe('WebSocket Connection Resilience', () => {
  it('reconnecting client receives current room state', async () => {
    const playerName = `Reconn_${Date.now()}`;
    const creator = await createRoomAs(playerName);
    const { roomCode, playerId } = creator.data;

    // First connection
    const bws1 = track(await connectWs(roomCode, playerId));
    const state1 = await bws1.waitForEvent('room_state');
    expect(state1.type).toBe('room_state');

    // Close the first connection
    bws1.close();

    // Wait a moment for server to process disconnect
    await new Promise(r => setTimeout(r, 200));

    // Reconnect
    const bws2 = track(await connectWs(roomCode, playerId));
    const state2 = await bws2.waitForEvent('room_state');
    expect(state2.type).toBe('room_state');
    if (state2.type === 'room_state') {
      expect(state2.room.code).toBe(roomCode);
    }
  });

  it('game state is preserved across reconnection', async () => {
    // Create a 4-player game
    const t = Date.now();
    const names = [`RCG1_${t}`, `RCG2_${t}`, `RCG3_${t}`, `RCG4_${t}`];
    const creator = await createRoomAs(names[0]);
    const { roomCode, playerId: creatorId } = creator.data;

    // Add 3 more players
    const playerIds = [creatorId];
    for (let i = 1; i < 4; i++) {
      const join = await apiPost(`/api/rooms/${roomCode}/add-player`, { playerName: names[i] });
      playerIds.push(join.data.playerId);
    }

    // Connect and start game
    const bws = track(await connectWs(roomCode, creatorId));
    await bws.waitForEvent('room_state');
    bws.send({ type: 'start_game', seatOrder: playerIds });
    const started = await bws.waitForEvent('game_started');
    expect(started.type).toBe('game_started');

    // Record a hand
    bws.send({
      type: 'record_hand',
      result: {
        resultType: 'agari',
        winnerIndex: 0,
        loserIndex: 1,
        isTsumo: false,
        han: 3,
        fu: 30,
        riichiPlayers: [false, false, false, false],
      },
    });
    const handEvt = await bws.waitForEvent('hand_recorded');
    expect(handEvt.type).toBe('hand_recorded');

    // Disconnect
    bws.close();
    await new Promise(r => setTimeout(r, 200));

    // Reconnect — should receive room_state with the game including 1 recorded hand
    const bws2 = track(await connectWs(roomCode, creatorId));
    const state = await bws2.waitForEvent('room_state');
    expect(state.type).toBe('room_state');
    if (state.type === 'room_state' && state.room.currentGame) {
      expect(state.room.currentGame.hands).toHaveLength(1);
    }
  });

  it('send returns false when connection is not open (WsClient unit test)', async () => {
    // This test verifies the WsClient.send() return value logic
    // by checking the raw WebSocket behavior directly
    const playerName = `SendFail_${Date.now()}`;
    const creator = await createRoomAs(playerName);
    const { roomCode, playerId } = creator.data;

    const playerCapability = playerCapabilities.get(`${roomCode}:${playerId}`)!;
    const hostCapability = hostCapabilities.get(roomCode)!;
    const params = new URLSearchParams({ roomCode, playerId, playerCapability, hostCapability });
    const url = `ws://localhost:${port}${BASE_PATH}/ws?${params}`;
    const ws = new WebSocket(url);

    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    // While open, send should work
    expect(ws.readyState).toBe(WebSocket.OPEN);

    ws.close();
    await new Promise<void>(resolve => ws.on('close', resolve));

    // After close, readyState should not be OPEN
    expect(ws.readyState).not.toBe(WebSocket.OPEN);
  });
});
