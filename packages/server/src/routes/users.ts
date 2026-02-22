import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { getDb } from '../db/connection.js';
import { registeredUsers } from '../db/schema.js';
import { eq, like, and } from 'drizzle-orm';
import { sendOtp, verifyOtp } from '../services/sms-service.js';

const userRoutes = new Hono();

// Register a new user (sends OTP)
userRoutes.post('/register', async (c) => {
  const body = await c.req.json<{ username: string; phone: string }>();
  if (!body.username?.trim() || !body.phone?.trim()) {
    return c.json({ error: 'Username and phone are required' }, 400);
  }

  const username = body.username.trim();
  const phone = body.phone.trim();

  const db = getDb();

  // Check if username already taken
  const existing = db.select().from(registeredUsers).where(eq(registeredUsers.username, username)).get();
  if (existing) {
    return c.json({ error: 'Username already taken' }, 409);
  }

  // Create user record (unverified)
  const now = Date.now();
  const id = nanoid();
  db.insert(registeredUsers).values({
    id,
    username,
    phone,
    phoneVerified: 0,
    createdAt: now,
    updatedAt: now,
  }).run();

  // Send OTP
  const result = await sendOtp(phone);
  if (!result.sent) {
    return c.json({ error: 'Failed to send verification code' }, 500);
  }

  return c.json({ id, username, phone, codeSent: true });
});

// Verify phone with OTP code
userRoutes.post('/verify', async (c) => {
  const body = await c.req.json<{ phone: string; code: string }>();
  if (!body.phone?.trim() || !body.code?.trim()) {
    return c.json({ error: 'Phone and code are required' }, 400);
  }

  const phone = body.phone.trim();
  const code = body.code.trim();

  const valid = verifyOtp(phone, code);
  if (!valid) {
    return c.json({ error: 'Invalid or expired verification code' }, 400);
  }

  const db = getDb();
  db.update(registeredUsers)
    .set({ phoneVerified: 1, updatedAt: Date.now() })
    .where(eq(registeredUsers.phone, phone))
    .run();

  return c.json({ verified: true });
});

// Resend OTP
userRoutes.post('/resend-otp', async (c) => {
  const body = await c.req.json<{ phone: string }>();
  if (!body.phone?.trim()) {
    return c.json({ error: 'Phone is required' }, 400);
  }

  const result = await sendOtp(body.phone.trim());
  if (!result.sent) {
    return c.json({ error: 'Failed to send verification code' }, 500);
  }

  return c.json({ codeSent: true });
});

// List all verified users
userRoutes.get('/', (c) => {
  const db = getDb();
  const users = db.select({
    id: registeredUsers.id,
    username: registeredUsers.username,
    phone: registeredUsers.phone,
  })
    .from(registeredUsers)
    .where(eq(registeredUsers.phoneVerified, 1))
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
    phone: registeredUsers.phone,
  })
    .from(registeredUsers)
    .where(and(like(registeredUsers.username, `%${q}%`), eq(registeredUsers.phoneVerified, 1)))
    .all();
  return c.json({ users });
});

export { userRoutes };
