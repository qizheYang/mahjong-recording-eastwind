import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { getDb } from '../db/connection.js';
import { registeredUsers } from '../db/schema.js';
import { eq, like } from 'drizzle-orm';
import { userSignIn, getUserFromHeader } from '../services/user-auth-service.js';

const userRoutes = new Hono();

// Register a new user (and auto-login)
userRoutes.post('/register', async (c) => {
  const body = await c.req.json<{ username: string; email: string; phone: string }>();
  if (!body.username?.trim()) {
    return c.json({ error: 'Username is required' }, 400);
  }
  if (!body.email?.trim() || !/.+@.+\..+/.test(body.email.trim())) {
    return c.json({ error: 'Valid email is required' }, 400);
  }
  if (!body.phone?.trim()) {
    return c.json({ error: 'Phone number is required' }, 400);
  }

  const username = body.username.trim();
  const email = body.email.trim().toLowerCase();
  const phone = body.phone.trim();
  const db = getDb();

  // Check if username already taken
  const existing = db.select().from(registeredUsers).where(eq(registeredUsers.username, username)).get();
  if (existing) {
    return c.json({ error: 'Username already taken' }, 409);
  }

  // Check if email already taken
  const existingEmail = db.select().from(registeredUsers).where(eq(registeredUsers.email, email)).get();
  if (existingEmail) {
    return c.json({ error: 'Email already registered' }, 409);
  }

  const now = Date.now();
  const id = nanoid();

  db.insert(registeredUsers).values({
    id,
    username,
    email,
    phone,
    emailVerified: 1,
    createdAt: now,
    updatedAt: now,
  }).run();

  // Auto-login: issue a token
  const session = userSignIn(username);

  return c.json({ id, username, token: session?.token ?? null });
});

// Login (username only, no password)
userRoutes.post('/login', async (c) => {
  const body = await c.req.json<{ username: string }>();
  if (!body.username?.trim()) {
    return c.json({ error: 'Username is required' }, 400);
  }

  const session = userSignIn(body.username.trim());
  if (!session) {
    return c.json({ error: '用户名不存在 (Username not found)' }, 404);
  }

  return c.json(session);
});

// Verify current session
userRoutes.get('/me', (c) => {
  const username = getUserFromHeader(c.req.header('Authorization'));
  if (!username) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return c.json({ username });
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
