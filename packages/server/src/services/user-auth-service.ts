import { nanoid } from 'nanoid';
import { eq, lt, like } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { registeredUsers, userTokens } from '../db/schema.js';

const TOKEN_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Sign in a registered user by username (no password).
 * Returns a session token or null if username not found.
 */
export function userSignIn(username: string): { token: string; username: string } | null {
  const db = getDb();

  // Case-insensitive lookup
  const user = db.select().from(registeredUsers)
    .where(eq(registeredUsers.emailVerified, 1))
    .all()
    .find(u => u.username.toLowerCase() === username.toLowerCase());

  if (!user) return null;

  // Clean expired tokens
  const now = Date.now();
  db.delete(userTokens).where(lt(userTokens.expiresAt, now)).run();

  // Create new token
  const token = nanoid(48);
  db.insert(userTokens).values({
    token,
    username: user.username,
    expiresAt: now + TOKEN_TTL,
  }).run();

  return { token, username: user.username };
}

/**
 * Verify a user token and return the username, or null if invalid/expired.
 */
export function verifyUserToken(token: string): string | null {
  const db = getDb();
  const entry = db.select().from(userTokens)
    .where(eq(userTokens.token, token))
    .get();

  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    db.delete(userTokens).where(eq(userTokens.token, token)).run();
    return null;
  }
  return entry.username;
}

/**
 * Extract and verify user token from Authorization header.
 * Returns username or null.
 */
export function getUserFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  return verifyUserToken(token);
}
