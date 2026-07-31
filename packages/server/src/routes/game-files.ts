import { Hono } from 'hono';
import { listGameRecords, getGameRecord, deleteGameRecord } from '../services/game-file-service.js';
import { rebuildPlayerDB } from '../services/player-db.js';
import { authorizeAdmin } from '../services/authorization-service.js';

const gameFileRoutes = new Hono();

// List all saved game records
gameFileRoutes.get('/', (c) => {
  const tagFilter = c.req.query('tag');
  let records = listGameRecords().filter(r => !r.inProgress);
  if (tagFilter) {
    records = records.filter(r => r.tags.includes(tagFilter));
  }
  return c.json({ games: records });
});

// Get a specific game record
gameFileRoutes.get('/:filename', (c) => {
  const filename = c.req.param('filename');
  const record = getGameRecord(filename);

  if (!record) {
    return c.json({ error: '记录不存在 (Record not found)' }, 404);
  }

  if (authorizeAdmin(c.req.header('Authorization'))) {
    return c.json(record);
  }

  return c.json({
    ...record,
    players: record.players.map(({ phone: _phone, ...player }) => player),
  });
});

// Delete a game record (administrator only)
gameFileRoutes.delete('/:filename', (c) => {
  if (!authorizeAdmin(c.req.header('Authorization'))) {
    return c.json({ error: '未授权 (Unauthorized)' }, 401);
  }

  const filename = c.req.param('filename');
  const deleted = deleteGameRecord(filename);
  if (!deleted) {
    return c.json({ error: '记录不存在 (Record not found)' }, 404);
  }
  rebuildPlayerDB(listGameRecords, getGameRecord);
  return c.json({ deleted: filename });
});

export { gameFileRoutes };
