import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { getDb } from '../db/connection.js';
import { registeredUsers } from '../db/schema.js';
import { eq, like, and } from 'drizzle-orm';
import { sendOtp, verifyOtp, isOtpEnabled } from '../services/email-service.js';

const userRoutes = new Hono();

// Register a new user
// Email is required. Sends email OTP via Resend for verification.
userRoutes.post('/register', async (c) => {
  const body = await c.req.json<{ username: string; email: string }>();
  if (!body.username?.trim()) {
    return c.json({ error: 'Username is required' }, 400);
  }
  if (!body.email?.trim()) {
    return c.json({ error: 'Email is required' }, 400);
  }

  const username = body.username.trim();
  const email = body.email.trim();

  const db = getDb();

  // Check if username already taken
  const existing = db.select().from(registeredUsers).where(eq(registeredUsers.username, username)).get();
  if (existing) {
    return c.json({ error: 'Username already taken' }, 409);
  }

  // Check if email already registered
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
    emailVerified: 0,
    createdAt: now,
    updatedAt: now,
  }).run();

  if (isOtpEnabled()) {
    const result = await sendOtp(email);
    if (!result.sent) {
      // Clean up the unverified user record
      db.delete(registeredUsers).where(eq(registeredUsers.id, id)).run();
      return c.json({ error: 'Failed to send verification email' }, 500);
    }
  }

  return c.json({ id, username, email, needsVerification: true });
});

// Verify email with OTP code
userRoutes.post('/verify', async (c) => {
  const body = await c.req.json<{ email: string; code: string }>();
  if (!body.email?.trim() || !body.code?.trim()) {
    return c.json({ error: 'Email and code are required' }, 400);
  }

  const email = body.email.trim();
  const code = body.code.trim();

  const valid = verifyOtp(email, code);
  if (!valid) {
    return c.json({ error: 'Invalid or expired verification code' }, 400);
  }

  const db = getDb();
  db.update(registeredUsers)
    .set({ emailVerified: 1, updatedAt: Date.now() })
    .where(eq(registeredUsers.email, email))
    .run();

  return c.json({ verified: true });
});

// Resend OTP
userRoutes.post('/resend-otp', async (c) => {
  const body = await c.req.json<{ email: string }>();
  if (!body.email?.trim()) {
    return c.json({ error: 'Email is required' }, 400);
  }

  const result = await sendOtp(body.email.trim());
  if (!result.sent) {
    return c.json({ error: 'Failed to send verification email' }, 500);
  }

  return c.json({ codeSent: true });
});

// List all verified users
userRoutes.get('/', (c) => {
  const db = getDb();
  const users = db.select({
    id: registeredUsers.id,
    username: registeredUsers.username,
    email: registeredUsers.email,
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
    email: registeredUsers.email,
  })
    .from(registeredUsers)
    .where(and(like(registeredUsers.username, `%${q}%`), eq(registeredUsers.emailVerified, 1)))
    .all();
  return c.json({ users });
});

export { userRoutes };
