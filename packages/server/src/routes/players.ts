import { Hono } from 'hono';
import { listPlayers, getPlayer, searchPlayers, rebuildPlayerDB, type PlayerRecord } from '../services/player-db.js';
import { listGameRecords, getGameRecord } from '../services/game-file-service.js';
import { getDb } from '../db/connection.js';
import { registeredUsers } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { authorizeAdmin } from '../services/authorization-service.js';

const playerRoutes = new Hono();

/** Merge registered users into player list so they appear even with 0 games */
function mergeRegisteredUsers(players: PlayerRecord[]): (PlayerRecord & { isRegistered: boolean })[] {
  const db = getDb();
  const users = db.select({ username: registeredUsers.username })
    .from(registeredUsers)
    .where(eq(registeredUsers.emailVerified, 1))
    .all();

  const registeredNames = new Set(users.map(u => u.username.toLowerCase()));
  const existingNames = new Set(players.map(p => p.name.toLowerCase()));

  const result: (PlayerRecord & { isRegistered: boolean })[] = players.map(p => {
    const { phone: _phone, ...publicPlayer } = p;
    return {
      ...publicPlayer,
      isRegistered: registeredNames.has(p.name.toLowerCase()),
    };
  });

  for (const user of users) {
    if (!existingNames.has(user.username.toLowerCase())) {
      result.push({
        name: user.username,
        games: [],
        totalGames: 0,
        avgPlacement: 0,
        avgGameScore: 0,
        isRegistered: true,
      });
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

// List all players
playerRoutes.get('/', (c) => {
  const q = c.req.query('q');
  if (q) {
    return c.json({ players: mergeRegisteredUsers(searchPlayers(q)) });
  }
  return c.json({ players: mergeRegisteredUsers(listPlayers()) });
});

// Rebuild player database from game files
playerRoutes.post('/rebuild', (c) => {
  if (!authorizeAdmin(c.req.header('Authorization'))) {
    return c.json({ error: '未授权 (Unauthorized)' }, 401);
  }

  const count = rebuildPlayerDB(listGameRecords, getGameRecord);
  return c.json({ rebuilt: count });
});

// Advanced search: find player by phone or email (from registered_users)
playerRoutes.get('/search-contact', (c) => {
  if (!authorizeAdmin(c.req.header('Authorization'))) {
    return c.json({ error: '未授权 (Unauthorized)' }, 401);
  }

  const q = c.req.query('q')?.trim();
  if (!q) return c.json({ players: [] });

  const db = getDb();
  const qLower = q.toLowerCase();

  const users = db.select({
    username: registeredUsers.username,
    email: registeredUsers.email,
    phone: registeredUsers.phone,
  })
    .from(registeredUsers)
    .where(eq(registeredUsers.emailVerified, 1))
    .all()
    .filter(u => u.email.toLowerCase() === qLower || u.phone === q);

  if (users.length === 0) return c.json({ players: [] });

  const results = users.map(u => {
    const player = getPlayer(u.username);
    return player
      ? { ...player, isRegistered: true }
      : { name: u.username, games: [], totalGames: 0, avgPlacement: 0, avgGameScore: 0, isRegistered: true };
  });

  return c.json({ players: results });
});

// Get a specific player
playerRoutes.get('/:name', (c) => {
  const name = decodeURIComponent(c.req.param('name'));
  const player = getPlayer(name);

  // Check if this name belongs to a registered user
  const db = getDb();
  const user = db.select({ username: registeredUsers.username })
    .from(registeredUsers)
    .where(eq(registeredUsers.emailVerified, 1))
    .all()
    .find(u => u.username.toLowerCase() === name.toLowerCase());

  if (player) {
    const { phone: _phone, ...publicPlayer } = player;
    return c.json({ ...publicPlayer, isRegistered: !!user });
  }

  // Registered user without games
  if (user) {
    return c.json({
      name: user.username,
      games: [],
      totalGames: 0,
      avgPlacement: 0,
      avgGameScore: 0,
      isRegistered: true,
    });
  }

  return c.json({ error: '玩家不存在 (Player not found)' }, 404);
});

export { playerRoutes };
