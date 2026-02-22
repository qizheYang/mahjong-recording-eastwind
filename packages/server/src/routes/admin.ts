import { Hono } from 'hono';
import { signIn, getAdminFromHeader } from '../services/admin-service.js';
import { getGameRecord, updateGameAnnotations, updateGameTags, deleteGameRecord } from '../services/game-file-service.js';
import { rebuildPlayerDB } from '../services/player-db.js';
import { listGameRecords } from '../services/game-file-service.js';

const adminRoutes = new Hono();

// Admin sign in
adminRoutes.post('/signin', async (c) => {
  const body = await c.req.json<{ username: string; password: string }>();
  if (!body.username || !body.password) {
    return c.json({ error: '请输入用户名和密码 (Username and password required)' }, 400);
  }

  const result = signIn(body.username, body.password);
  if (!result) {
    return c.json({ error: '用户名或密码错误 (Invalid credentials)' }, 401);
  }

  return c.json(result);
});

// Verify token
adminRoutes.get('/me', (c) => {
  const username = getAdminFromHeader(c.req.header('Authorization'));
  if (!username) {
    return c.json({ error: '未授权 (Unauthorized)' }, 401);
  }
  return c.json({ username });
});

// Get annotations for a game
adminRoutes.get('/games/:filename/annotations', (c) => {
  const username = getAdminFromHeader(c.req.header('Authorization'));
  if (!username) {
    return c.json({ error: '未授权 (Unauthorized)' }, 401);
  }

  const filename = c.req.param('filename');
  const record = getGameRecord(filename);
  if (!record) {
    return c.json({ error: '记录不存在 (Record not found)' }, 404);
  }

  return c.json({ annotations: record.adminAnnotations ?? null });
});

// Update annotations for a game
adminRoutes.patch('/games/:filename/annotations', async (c) => {
  const username = getAdminFromHeader(c.req.header('Authorization'));
  if (!username) {
    return c.json({ error: '未授权 (Unauthorized)' }, 401);
  }

  const filename = c.req.param('filename');
  const body = await c.req.json<{ isOfficialGame: boolean; notes: string }>();

  const record = updateGameAnnotations(filename, {
    isOfficialGame: !!body.isOfficialGame,
    notes: body.notes ?? '',
    annotatedBy: username,
  });

  if (!record) {
    return c.json({ error: '记录不存在 (Record not found)' }, 404);
  }

  return c.json({ annotations: record.adminAnnotations });
});

// Update tags on a game record
adminRoutes.patch('/games/:filename/tags', async (c) => {
  const username = getAdminFromHeader(c.req.header('Authorization'));
  if (!username) {
    return c.json({ error: '未授权 (Unauthorized)' }, 401);
  }

  const filename = c.req.param('filename');
  const body = await c.req.json<{ tags: string[] }>();

  if (!Array.isArray(body.tags)) {
    return c.json({ error: '标签格式错误 (Tags must be an array)' }, 400);
  }

  const record = updateGameTags(filename, body.tags);
  if (!record) {
    return c.json({ error: '记录不存在 (Record not found)' }, 404);
  }

  return c.json({ tags: record.tags });
});

// Delete a game record (admin only)
adminRoutes.delete('/games/:filename', (c) => {
  const username = getAdminFromHeader(c.req.header('Authorization'));
  if (!username) {
    return c.json({ error: '未授权 (Unauthorized)' }, 401);
  }

  const filename = c.req.param('filename');
  const deleted = deleteGameRecord(filename);
  if (!deleted) {
    return c.json({ error: '记录不存在 (Record not found)' }, 404);
  }

  // Rebuild player DB to reflect the deletion
  rebuildPlayerDB(listGameRecords, getGameRecord);

  return c.json({ deleted: filename });
});

export { adminRoutes };
