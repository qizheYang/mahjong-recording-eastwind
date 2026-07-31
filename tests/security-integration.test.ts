import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serve } from '@hono/node-server';
import type { Server } from 'http';
import { createApp } from '../packages/server/src/app';
import WebSocket from 'ws';
import type { ClientEvent, ServerEvent } from '@mahjong/shared';
import { createAdmin, signIn } from '../packages/server/src/services/admin-service';

const BASE_PATH = '/mahjong-recording';
let server: Server;
let port: number;
let identityCounter = 0;
const openSockets: WebSocket[] = [];

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`http://127.0.0.1:${port}${BASE_PATH}${path}`, init);
  return {
    status: response.status,
    data: await response.json() as Record<string, unknown>,
  };
}

async function createIdentity(prefix: string): Promise<string> {
  const suffix = `${Date.now()}-${identityCounter++}`;
  const result = await request('/api/users/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: `${prefix}-${suffix}`,
      email: `${prefix}-${suffix}@security.test`,
      phone: `security-${suffix}`,
    }),
  });
  expect(result.status).toBe(200);
  return result.data.token as string;
}

async function createRoom(prefix: string) {
  const token = await createIdentity(prefix);
  const result = await request('/api/rooms', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(result.status).toBe(200);
  return result.data as {
    roomCode: string;
    playerId: string;
    playerCapability?: string;
    hostCapability?: string;
  };
}

async function joinRoom(roomCode: string, prefix: string) {
  const token = await createIdentity(prefix);
  const result = await request(`/api/rooms/${roomCode}/join`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(result.status).toBe(200);
  return result.data as {
    roomCode: string;
    playerId: string;
    playerCapability?: string;
    hostCapability?: string;
  };
}

function connectWs(
  roomCode: string,
  playerId: string,
  playerCapability?: string,
  hostCapability?: string,
) {
  const params = new URLSearchParams({ roomCode, playerId });
  if (playerCapability) params.set('playerCapability', playerCapability);
  if (hostCapability) params.set('hostCapability', hostCapability);
  const ws = new WebSocket(`ws://127.0.0.1:${port}${BASE_PATH}/ws?${params}`);
  openSockets.push(ws);

  const messages: ServerEvent[] = [];
  const waiters: Array<(event: ServerEvent) => void> = [];
  ws.on('message', (data) => {
    if (data.toString() === 'pong') return;
    const event = JSON.parse(data.toString()) as ServerEvent;
    const waiter = waiters.shift();
    if (waiter) waiter(event);
    else messages.push(event);
  });

  return {
    ws,
    open: () => new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    }),
    next: (timeoutMs = 2_000) => {
      const queued = messages.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise<ServerEvent>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out waiting for WebSocket event')), timeoutMs);
        waiters.push((event) => {
          clearTimeout(timer);
          resolve(event);
        });
      });
    },
    send: (event: ClientEvent) => ws.send(JSON.stringify(event)),
  };
}

async function nextEventOfType(
  client: ReturnType<typeof connectWs>,
  type: ServerEvent['type'],
): Promise<ServerEvent> {
  for (let i = 0; i < 8; i++) {
    const event = await client.next();
    if (event.type === type) return event;
  }
  throw new Error(`Did not receive WebSocket event ${type}`);
}

async function setupStartedRoom(withHand: boolean) {
  const creator = await createRoom('control-host');
  const guests = await Promise.all([
    joinRoom(creator.roomCode, 'control-guest-a'),
    joinRoom(creator.roomCode, 'control-guest-b'),
    joinRoom(creator.roomCode, 'control-guest-c'),
  ]);
  const host = connectWs(
    creator.roomCode,
    creator.playerId,
    creator.playerCapability,
    creator.hostCapability,
  );
  const guest = connectWs(
    creator.roomCode,
    guests[0].playerId,
    guests[0].playerCapability,
  );
  await Promise.all([host.open(), guest.open()]);
  await Promise.all([host.next(), guest.next()]);

  host.send({
    type: 'start_game',
    seatOrder: [creator.playerId, ...guests.map((player) => player.playerId)],
  });
  const [hostStarted, guestStarted] = await Promise.all([
    nextEventOfType(host, 'game_started'),
    nextEventOfType(guest, 'game_started'),
  ]);
  expect(hostStarted.type).toBe('game_started');
  expect(guestStarted.type).toBe('game_started');

  if (withHand) {
    host.send({
      type: 'record_hand',
      result: {
        resultType: 'agari',
        winnerIndex: 1,
        loserIndex: 0,
        isTsumo: false,
        han: 1,
        fu: 30,
      },
    });
    const [hostRecorded, guestRecorded] = await Promise.all([
      nextEventOfType(host, 'hand_recorded'),
      nextEventOfType(guest, 'hand_recorded'),
    ]);
    expect(hostRecorded.type).toBe('hand_recorded');
    expect(guestRecorded.type).toBe('hand_recorded');
  }

  return { creator, guests, host, guest };
}

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

afterAll(async () => {
  for (const ws of openSockets) ws.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('destructive HTTP authorization', () => {
  it('rejects unauthenticated game deletion before looking up the record', async () => {
    const result = await request('/api/games/does-not-exist.json', { method: 'DELETE' });

    expect(result.status).toBe(401);
    expect(result.data.error).toMatch(/Unauthorized|未授权/);
  });

  it('rejects unauthenticated player database rebuilds', async () => {
    const result = await request('/api/players/rebuild', { method: 'POST' });

    expect(result.status).toBe(401);
    expect(result.data.error).toMatch(/Unauthorized|未授权/);
  });

  it('accepts the existing database-backed admin session on protected routes', async () => {
    const username = `security-admin-${Date.now()}`;
    createAdmin(username, 'security-test-password');
    const session = signIn(username, 'security-test-password');
    expect(session?.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const headers = { Authorization: `Bearer ${session!.token}` };

    const missingGame = await request('/api/games/does-not-exist.json', {
      method: 'DELETE',
      headers,
    });
    const rebuild = await request('/api/players/rebuild', {
      method: 'POST',
      headers,
    });

    expect(missingGame.status).toBe(404);
    expect(rebuild.status).toBe(200);
  });
});

describe('room capabilities', () => {
  it('issues separate high-entropy player and host capabilities only to the creator', async () => {
    const creator = await createRoom('cap-host');
    const guest = await joinRoom(creator.roomCode, 'cap-guest');

    expect(creator.playerCapability).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(creator.hostCapability).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(creator.hostCapability).not.toBe(creator.playerCapability);
    expect(guest.playerCapability).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(guest.hostCapability).toBeUndefined();
  });

  it('rejects a WebSocket connection that presents public IDs without its player capability', async () => {
    const creator = await createRoom('id-only');
    const client = connectWs(creator.roomCode, creator.playerId);
    await client.open();

    const event = await client.next();
    expect(event).toMatchObject({ type: 'error', code: 'INVALID_CAPABILITY' });
  });

  it('rejects start_game from a non-host with a valid player capability', async () => {
    const creator = await createRoom('start-host');
    const guests = await Promise.all([
      joinRoom(creator.roomCode, 'start-guest-a'),
      joinRoom(creator.roomCode, 'start-guest-b'),
      joinRoom(creator.roomCode, 'start-guest-c'),
    ]);
    const guest = guests[0];
    const client = connectWs(creator.roomCode, guest.playerId, guest.playerCapability);
    await client.open();
    expect((await client.next()).type).toBe('room_state');

    client.send({
      type: 'start_game',
      seatOrder: [creator.playerId, ...guests.map((player) => player.playerId)],
    });

    expect(await client.next()).toMatchObject({ type: 'error', code: 'HOST_REQUIRED' });
  });

  it.each([
    {
      name: 'edit_hand',
      withHand: true,
      event: {
        type: 'edit_hand',
        handNumber: 1,
        result: {
          resultType: 'agari',
          winnerIndex: 2,
          loserIndex: 0,
          isTsumo: false,
          han: 2,
          fu: 30,
        },
      } as ClientEvent,
    },
    { name: 'undo_last_hand', withHand: true, event: { type: 'undo_last_hand' } as ClientEvent },
    { name: 'end_game', withHand: false, event: { type: 'end_game' } as ClientEvent },
    { name: 'force_quit_game', withHand: false, event: { type: 'force_quit_game' } as ClientEvent },
  ])('rejects $name from a non-host with a valid player capability', async ({ withHand, event }) => {
    const { guest } = await setupStartedRoom(withHand);

    guest.send(event);

    expect(await guest.next()).toMatchObject({ type: 'error', code: 'HOST_REQUIRED' });
  });

  it('rejects room reset without the host capability', async () => {
    const { creator, guests } = await setupStartedRoom(false);

    const result = await request(`/api/rooms/${creator.roomCode}/reset`, {
      method: 'POST',
      headers: { 'X-Room-Capability': guests[0].playerCapability ?? '' },
    });

    expect(result.status).toBe(403);
    expect(result.data.error).toMatch(/Host|房主/);
  });
});

describe('production origin policy', () => {
  it('rejects untrusted browser origins and echoes an explicitly allowed origin', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousAllowedOrigins = process.env.ALLOWED_ORIGINS;
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS = 'https://trusted.security.test';

    try {
      const { app } = createApp();
      const rejected = await app.request(`${BASE_PATH}/api/health`, {
        headers: { Origin: 'https://evil.security.test' },
      });
      const allowed = await app.request(`${BASE_PATH}/api/health`, {
        headers: { Origin: 'https://trusted.security.test' },
      });

      expect(rejected.status).toBe(403);
      expect(allowed.status).toBe(200);
      expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://trusted.security.test');
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      if (previousAllowedOrigins === undefined) delete process.env.ALLOWED_ORIGINS;
      else process.env.ALLOWED_ORIGINS = previousAllowedOrigins;
    }
  });
});

describe('unauthenticated live data minimization', () => {
  it('redacts room/player identifiers and contact data from room lookup', async () => {
    const creator = await createRoom('private-room');
    const addResult = await request(`/api/rooms/${creator.roomCode}/add-player`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Room-Capability': creator.hostCapability ?? '',
      },
      body: JSON.stringify({ playerName: 'Private Guest', phone: '+1-555-private' }),
    });
    expect(addResult.status).toBe(200);

    const result = await request(`/api/rooms/${creator.roomCode}`);

    expect(result.status).toBe(200);
    const room = result.data.room as Record<string, any>;
    expect(room.code).toBeUndefined();
    expect(room.creatorId).toBeUndefined();
    expect(room.players).toHaveLength(2);
    for (const player of room.players) {
      expect(player.id).toBeUndefined();
      expect(player.phone).toBeUndefined();
    }
  });

  it('does not publish room codes, player names, or per-player scores in anonymous live listings', async () => {
    await createRoom('private-listing');

    const result = await request('/api/live-games');

    expect(result.status).toBe(200);
    const games = result.data.games as Array<Record<string, any>>;
    expect(games.length).toBeGreaterThan(0);
    for (const game of games) {
      expect(game.roomCode).toBeUndefined();
      expect(game.playerNames).toBeUndefined();
      expect(game.gameInfo?.playerPoints).toBeUndefined();
    }
  });
});

describe('host capability on room HTTP controls', () => {
  it('requires the host capability to add and remove solo-mode players', async () => {
    const creator = await createRoom('solo-control');
    const deniedAdd = await request(`/api/rooms/${creator.roomCode}/add-player`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName: 'Injected Player' }),
    });
    expect(deniedAdd.status).toBe(403);

    const allowedAdd = await request(`/api/rooms/${creator.roomCode}/add-player`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Room-Capability': creator.hostCapability ?? '',
      },
      body: JSON.stringify({ playerName: 'Host Added Player' }),
    });
    expect(allowedAdd.status).toBe(200);

    const deniedRemove = await request(`/api/rooms/${creator.roomCode}/remove-player`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: allowedAdd.data.playerId }),
    });
    expect(deniedRemove.status).toBe(403);

    const allowedRemove = await request(`/api/rooms/${creator.roomCode}/remove-player`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Room-Capability': creator.hostCapability ?? '',
      },
      body: JSON.stringify({ playerId: allowedAdd.data.playerId }),
    });
    expect(allowedRemove.status).toBe(200);
  });

  it('does not accept the public creator ID as authority to disband a room', async () => {
    const creator = await createRoom('disband-control');

    const denied = await request(
      `/api/rooms/${creator.roomCode}?playerId=${encodeURIComponent(creator.playerId)}`,
      { method: 'DELETE' },
    );
    expect(denied.status).toBe(403);

    const allowed = await request(`/api/rooms/${creator.roomCode}`, {
      method: 'DELETE',
      headers: { 'X-Room-Capability': creator.hostCapability ?? '' },
    });
    expect(allowed.status).toBe(200);
  });

  it('closes an already-connected player when the host removes them', async () => {
    const creator = await createRoom('remove-connected');
    const guest = await joinRoom(creator.roomCode, 'removed-guest');
    const client = connectWs(creator.roomCode, guest.playerId, guest.playerCapability);
    await client.open();
    expect((await client.next()).type).toBe('room_state');
    const closed = new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Removed player connection stayed open')), 2_000);
      client.ws.once('close', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });

    const removed = await request(`/api/rooms/${creator.roomCode}/remove-player`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Room-Capability': creator.hostCapability ?? '',
      },
      body: JSON.stringify({ playerId: guest.playerId }),
    });

    expect(removed.status).toBe(200);
    expect(await closed).toBe(4003);
  });
});

describe('request resource limits', () => {
  it('rejects HTTP request bodies larger than 64 KiB', async () => {
    const suffix = `${Date.now()}-${identityCounter++}`;
    const result = await request('/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `oversized-${'x'.repeat(70 * 1024)}`,
        email: `oversized-${suffix}@security.test`,
        phone: `oversized-${suffix}`,
      }),
    });

    expect(result.status).toBe(413);
  });

  it('rejects individual WebSocket messages larger than 64 KiB', async () => {
    const creator = await createRoom('oversized-ws');
    const client = connectWs(
      creator.roomCode,
      creator.playerId,
      creator.playerCapability,
      creator.hostCapability,
    );
    await client.open();
    expect((await client.next()).type).toBe('room_state');

    const closed = new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Oversized WebSocket message was not rejected')), 2_000);
      client.ws.once('close', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });

    client.ws.send(JSON.stringify({ type: 'unknown', value: 'x'.repeat(70 * 1024) }));

    expect(await closed).toBe(1009);
  });

  it('rate-limits a WebSocket client that floods control messages', async () => {
    const creator = await createRoom('flood-ws');
    const client = connectWs(
      creator.roomCode,
      creator.playerId,
      creator.playerCapability,
      creator.hostCapability,
    );
    await client.open();
    expect((await client.next()).type).toBe('room_state');

    const rateLimited = new Promise<ServerEvent>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server did not rate-limit WebSocket flood')), 2_000);
      client.ws.on('message', (data) => {
        if (data.toString() === 'pong') return;
        const event = JSON.parse(data.toString()) as ServerEvent;
        if (event.type === 'error' && event.code === 'RATE_LIMITED') {
          clearTimeout(timer);
          resolve(event);
        }
      });
    });

    for (let i = 0; i < 110; i++) client.send({ type: 'ready_toggle' });

    expect(await rateLimited).toMatchObject({ type: 'error', code: 'RATE_LIMITED' });
  });
});

describe('contact data minimization', () => {
  it('does not expose stored phone numbers or anonymous contact lookup', async () => {
    const creator = await createRoom('contact-host');
    const playerIds = [creator.playerId];
    const privatePhone = '+1-555-0100-private';
    for (let index = 0; index < 3; index++) {
      const added = await request(`/api/rooms/${creator.roomCode}/add-player`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Room-Capability': creator.hostCapability ?? '',
        },
        body: JSON.stringify({
          playerName: `Contact Guest ${index}`,
          phone: index === 0 ? privatePhone : `private-${index}`,
        }),
      });
      expect(added.status).toBe(200);
      playerIds.push(added.data.playerId as string);
    }

    const host = connectWs(
      creator.roomCode,
      creator.playerId,
      creator.playerCapability,
      creator.hostCapability,
    );
    await host.open();
    expect((await host.next()).type).toBe('room_state');
    host.send({ type: 'start_game', seatOrder: playerIds });
    expect((await nextEventOfType(host, 'game_started')).type).toBe('game_started');
    host.send({
      type: 'record_hand',
      result: {
        resultType: 'agari',
        winnerIndex: 1,
        loserIndex: 0,
        isTsumo: false,
        han: 1,
        fu: 30,
      },
    });
    expect((await nextEventOfType(host, 'hand_recorded')).type).toBe('hand_recorded');
    host.send({ type: 'end_game' });
    const ended = await nextEventOfType(host, 'game_ended');
    expect(ended.type).toBe('game_ended');
    const savedFilename = ended.type === 'game_ended' ? ended.savedFilename : undefined;
    expect(savedFilename).toBeTruthy();

    const players = await request('/api/players');
    expect(JSON.stringify(players.data)).not.toContain(privatePhone);

    const game = await request(`/api/games/${encodeURIComponent(savedFilename!)}`);
    expect(JSON.stringify(game.data)).not.toContain(privatePhone);

    const lookup = await request(`/api/players/search-contact?q=${encodeURIComponent(privatePhone)}`);
    expect(lookup.status).toBe(401);
  });
});
