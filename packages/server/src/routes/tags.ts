import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { tags } from '../db/schema.js';
import { getAdminFromHeader } from '../services/admin-service.js';

const tagRoutes = new Hono();

// List all tags (public)
tagRoutes.get('/', (c) => {
  const db = getDb();
  const rows = db.select().from(tags).orderBy(tags.createdAt).all();
  return c.json({ tags: rows.map(r => r.name) });
});

// Create a new tag (public — any user can create)
tagRoutes.post('/', async (c) => {
  const body = await c.req.json<{ name: string }>();
  const name = body.name?.trim();

  if (!name || name.length === 0) {
    return c.json({ error: '标签名不能为空 (Tag name required)' }, 400);
  }
  if (name.length > 20) {
    return c.json({ error: '标签名过长 (Tag name too long, max 20)' }, 400);
  }

  const db = getDb();
  const existing = db.select().from(tags).where(eq(tags.name, name)).get();
  if (existing) {
    return c.json({ tag: existing.name });
  }

  db.insert(tags).values({ name, createdAt: Date.now() }).run();
  return c.json({ tag: name }, 201);
});

// Delete a tag (admin only)
tagRoutes.delete('/:name', (c) => {
  const username = getAdminFromHeader(c.req.header('Authorization'));
  if (!username) {
    return c.json({ error: '未授权 (Unauthorized)' }, 401);
  }

  const name = decodeURIComponent(c.req.param('name'));
  const db = getDb();

  const existing = db.select().from(tags).where(eq(tags.name, name)).get();
  if (!existing) {
    return c.json({ error: '标签不存在 (Tag not found)' }, 404);
  }

  db.delete(tags).where(eq(tags.name, name)).run();
  return c.json({ deleted: name });
});

export { tagRoutes };
