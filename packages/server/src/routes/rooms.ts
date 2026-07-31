import { Hono } from 'hono';
import { roomManager } from '../ws/room-manager.js';
import { getAdminFromHeader } from '../services/admin-service.js';
import { getUserFromHeader } from '../services/user-auth-service.js';

const roomRoutes = new Hono();

// Create a new room (requires user auth)
roomRoutes.post('/', async (c) => {
  const username = getUserFromHeader(c.req.header('Authorization'));
  if (!username) {
    return c.json({ error: '请先登录 (Please log in first)' }, 401);
  }

  return c.json(roomManager.createRoom(username));
});

// Join an existing room (requires user auth)
roomRoutes.post('/:code/join', async (c) => {
  const code = c.req.param('code').toUpperCase();
  const username = getUserFromHeader(c.req.header('Authorization'));
  if (!username) {
    return c.json({ error: '请先登录 (Please log in first)' }, 401);
  }

  const result = roomManager.joinRoom(code, username);

  if ('error' in result) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({
    roomCode: code,
    playerId: result.playerId,
    playerCapability: result.playerCapability,
  });
});

// Add a player by name (solo recording mode — host adds other players, no auth needed)
roomRoutes.post('/:code/add-player', async (c) => {
  const code = c.req.param('code').toUpperCase();
  if (!roomManager.authorizeHost(code, c.req.header('X-Room-Capability'))) {
    return c.json({ error: '只有房主可以添加玩家 (Host capability required)' }, 403);
  }
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

  return c.json({
    roomCode: code,
    playerId: result.playerId,
    playerCapability: result.playerCapability,
  });
});

// Get room state
roomRoutes.get('/:code', (c) => {
  const code = c.req.param('code').toUpperCase();
  const room = roomManager.getRoom(code);

  if (!room) {
    return c.json({ error: '房间不存在 (Room not found)' }, 404);
  }

  const admin = getAdminFromHeader(c.req.header('Authorization'));
  const playerAuthorized = roomManager.authorizePlayer(
    code,
    c.req.header('X-Player-Id'),
    c.req.header('X-Player-Capability'),
  );
  return c.json({ room: admin || playerAuthorized ? room : roomManager.getPublicRoom(code) });
});

// Remove a player (solo mode — host removes other players)
roomRoutes.post('/:code/remove-player', async (c) => {
  const code = c.req.param('code').toUpperCase();
  if (!roomManager.authorizeHost(code, c.req.header('X-Room-Capability'))) {
    return c.json({ error: '只有房主可以移除玩家 (Host capability required)' }, 403);
  }
  const body = await c.req.json<{ playerId: string }>();

  if (!body.playerId) {
    return c.json({ error: 'playerId is required' }, 400);
  }

  const room = roomManager.getRoom(code);
  if (!room) {
    return c.json({ error: '房间不存在 (Room not found)' }, 404);
  }
  if (room.status !== 'waiting') {
    return c.json({ error: '对局中无法移除 (Cannot remove during game)' }, 400);
  }

  roomManager.removePlayer(code, body.playerId);
  return c.json({ ok: true });
});

// Kill (disband) a room
roomRoutes.delete('/:code', (c) => {
  const code = c.req.param('code').toUpperCase();
  const room = roomManager.getRoom(code);

  if (!room) {
    return c.json({ error: '房间不存在 (Room not found)' }, 404);
  }

  // Check admin auth
  const adminUser = getAdminFromHeader(c.req.header('Authorization'));
  if (adminUser) {
    // Admin can kill any room that hasn't started a game
    if (room.status !== 'waiting') {
      return c.json({ error: '对局中无法解散 (Cannot kill room with game in progress)' }, 400);
    }
    roomManager.killRoom(code, 'Admin disbanded room');
    return c.json({ ok: true });
  }

  if (!roomManager.authorizeHost(code, c.req.header('X-Room-Capability'))) {
    return c.json({ error: '只有房主可以解散房间 (Only creator can disband)' }, 403);
  }

  if (room.status !== 'waiting') {
    return c.json({ error: '对局中无法解散 (Cannot kill room with game in progress)' }, 400);
  }

  roomManager.killRoom(code, 'Creator disbanded room');
  return c.json({ ok: true });
});

// Reset room for new game
roomRoutes.post('/:code/reset', (c) => {
  const code = c.req.param('code').toUpperCase();
  if (!roomManager.authorizeHost(code, c.req.header('X-Room-Capability'))) {
    return c.json({ error: '只有房主可以重置房间 (Host capability required)' }, 403);
  }
  const room = roomManager.resetRoom(code);

  if (!room) {
    return c.json({ error: '房间不存在 (Room not found)' }, 404);
  }

  roomManager.broadcast(code, { type: 'room_state', room });
  return c.json({ room });
});

export { roomRoutes };
