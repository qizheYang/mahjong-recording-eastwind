import { Hono } from 'hono';
import { listPlayers, getPlayer, searchPlayers, rebuildPlayerDB, type PlayerRecord } from '../services/player-db.js';
import { listGameRecords, getGameRecord } from '../services/game-file-service.js';
import { getDb } from '../db/connection.js';
import { registeredUsers } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const playerRoutes = new Hono();

/** Merge registered users into player list so they appear even with 0 games */
function mergeRegisteredUsers(players: PlayerRecord[]): PlayerRecord[] {
  const db = getDb();
  const users = db.select({ username: registeredUsers.username })
    .from(registeredUsers)
    .where(eq(registeredUsers.emailVerified, 1))
    .all();

  const existingNames = new Set(players.map(p => p.name.toLowerCase()));

  for (const user of users) {
    if (!existingNames.has(user.username.toLowerCase())) {
      players.push({
        name: user.username,
        games: [],
        totalGames: 0,
        avgPlacement: 0,
        avgGameScore: 0,
      });
    }
  }

  return players.sort((a, b) => a.name.localeCompare(b.name));
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
  const count = rebuildPlayerDB(listGameRecords, getGameRecord);
  return c.json({ rebuilt: count });
});

// Get a specific player
playerRoutes.get('/:name', (c) => {
  const name = decodeURIComponent(c.req.param('name'));
  const player = getPlayer(name);

  if (player) {
    return c.json(player);
  }

  // Check if this is a registered user without games
  const db = getDb();
  const user = db.select({ username: registeredUsers.username })
    .from(registeredUsers)
    .where(eq(registeredUsers.username, name))
    .get();

  if (user) {
    return c.json({
      name: user.username,
      games: [],
      totalGames: 0,
      avgPlacement: 0,
      avgGameScore: 0,
    });
  }

  return c.json({ error: '玩家不存在 (Player not found)' }, 404);
});

export { playerRoutes };
