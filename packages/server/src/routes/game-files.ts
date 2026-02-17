import { Hono } from 'hono';
import { listGameRecords, getGameRecord } from '../services/game-file-service.js';

const gameFileRoutes = new Hono();

// List all saved game records
gameFileRoutes.get('/', (c) => {
  const tagFilter = c.req.query('tag');
  let records = listGameRecords();
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

  return c.json(record);
});

export { gameFileRoutes };
