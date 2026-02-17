import { Hono } from 'hono';
import { listPlayers, getPlayer, searchPlayers, rebuildPlayerDB } from '../services/player-db.js';
import { listGameRecords, getGameRecord } from '../services/game-file-service.js';

const playerRoutes = new Hono();

// List all players
playerRoutes.get('/', (c) => {
  const q = c.req.query('q');
  if (q) {
    return c.json({ players: searchPlayers(q) });
  }
  return c.json({ players: listPlayers() });
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

  if (!player) {
    return c.json({ error: '玩家不存在 (Player not found)' }, 404);
  }

  return c.json(player);
});

export { playerRoutes };
