import { Hono } from 'hono';
import { roomManager } from '../ws/room-manager.js';

const roomRoutes = new Hono();

// Create a new room
roomRoutes.post('/', async (c) => {
  const body = await c.req.json<{ playerName: string; phone?: string }>();

  if (!body.playerName || body.playerName.trim().length === 0) {
    return c.json({ error: '请输入玩家名称 (Player name required)' }, 400);
  }

  const { roomCode, playerId } = roomManager.createRoom(body.playerName.trim(), body.phone?.trim() || undefined);

  return c.json({ roomCode, playerId });
});

// Join an existing room
roomRoutes.post('/:code/join', async (c) => {
  const code = c.req.param('code').toUpperCase();
  const body = await c.req.json<{ playerName: string; phone?: string }>();

  if (!body.playerName || body.playerName.trim().length === 0) {
    return c.json({ error: '请输入玩家名称 (Player name required)' }, 400);
  }

  const result = roomManager.joinRoom(code, body.playerName.trim(), body.phone?.trim() || undefined);

  if ('error' in result) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({ roomCode: code, playerId: result.playerId });
});

// Add a player by name (solo recording mode — host adds other players)
roomRoutes.post('/:code/add-player', async (c) => {
  const code = c.req.param('code').toUpperCase();
  const body = await c.req.json<{ playerName: string; phone?: string }>();

  if (!body.playerName || body.playerName.trim().length === 0) {
    return c.json({ error: '请输入玩家名称 (Player name required)' }, 400);
  }

  const result = roomManager.joinRoom(code, body.playerName.trim(), body.phone?.trim() || undefined);

  if ('error' in result) {
    return c.json({ error: result.error }, 400);
  }

  // Broadcast to connected WS clients so the host sees the update
  const player = result.room.players.find(p => p.id === result.playerId);
  if (player) {
    roomManager.broadcast(code, { type: 'player_joined', player });
  }

  return c.json({ roomCode: code, playerId: result.playerId });
});

// Get room state
roomRoutes.get('/:code', (c) => {
  const code = c.req.param('code').toUpperCase();
  const room = roomManager.getRoom(code);

  if (!room) {
    return c.json({ error: '房间不存在 (Room not found)' }, 404);
  }

  return c.json({ room });
});

// Reset room for new game
roomRoutes.post('/:code/reset', (c) => {
  const code = c.req.param('code').toUpperCase();
  const room = roomManager.resetRoom(code);

  if (!room) {
    return c.json({ error: '房间不存在 (Room not found)' }, 404);
  }

  roomManager.broadcast(code, { type: 'room_state', room });
  return c.json({ room });
});

export { roomRoutes };
