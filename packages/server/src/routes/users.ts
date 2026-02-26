import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { getDb } from '../db/connection.js';
import { registeredUsers } from '../db/schema.js';
import { eq, like } from 'drizzle-orm';

const userRoutes = new Hono();

// Register a new user
userRoutes.post('/register', async (c) => {
  const body = await c.req.json<{ username: string }>();
  if (!body.username?.trim()) {
    return c.json({ error: 'Username is required' }, 400);
  }

  const username = body.username.trim();
  const db = getDb();

  // Check if username already taken
  const existing = db.select().from(registeredUsers).where(eq(registeredUsers.username, username)).get();
  if (existing) {
    return c.json({ error: 'Username already taken' }, 409);
  }

  const now = Date.now();
  const id = nanoid();

  db.insert(registeredUsers).values({
    id,
    username,
    email: '',
    emailVerified: 1,
    createdAt: now,
    updatedAt: now,
  }).run();

  return c.json({ id, username });
});

// List all registered users
userRoutes.get('/', (c) => {
  const db = getDb();
  const users = db.select({
    id: registeredUsers.id,
    username: registeredUsers.username,
  })
    .from(registeredUsers)
    .where(eq(registeredUsers.emailVerified, 1))
    .all();

  return c.json({ users });
});

// Search users by name
userRoutes.get('/search', (c) => {
  const q = c.req.query('q')?.trim();
  if (!q) {
    return c.json({ users: [] });
  }

  const db = getDb();
  const users = db.select({
    id: registeredUsers.id,
    username: registeredUsers.username,
  })
    .from(registeredUsers)
    .where(like(registeredUsers.username, `%${q}%`))
    .all();
  return c.json({ users });
});

export { userRoutes };
