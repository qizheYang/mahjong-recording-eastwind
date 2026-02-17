import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import { nanoid } from 'nanoid';
import { eq, lt } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { adminAccounts, adminTokens } from '../db/schema.js';

const TOKEN_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex');
}

/**
 * Create an admin account. Called by the server owner (e.g., via a CLI script).
 */
export function createAdmin(username: string, password: string): void {
  const db = getDb();
  const existing = db.select().from(adminAccounts)
    .where(eq(adminAccounts.username, username.toLowerCase()))
    .get();

  if (existing) {
    throw new Error(`Admin "${username}" already exists`);
  }

  const salt = randomBytes(32).toString('hex');
  const passwordHash = hashPassword(password, salt);

  db.insert(adminAccounts).values({
    username: username.toLowerCase(),
    passwordHash,
    salt,
    createdAt: Date.now(),
  }).run();
}

/**
 * Verify admin credentials and return a session token.
 */
export function signIn(username: string, password: string): { token: string; username: string } | null {
  const db = getDb();
  const account = db.select().from(adminAccounts)
    .where(eq(adminAccounts.username, username.toLowerCase()))
    .get();

  if (!account) return null;

  const hash = scryptSync(password, account.salt, 64);
  const storedHash = Buffer.from(account.passwordHash, 'hex');
  if (!timingSafeEqual(hash, storedHash)) return null;

  // Clean expired tokens
  const now = Date.now();
  db.delete(adminTokens).where(lt(adminTokens.expiresAt, now)).run();

  // Create new token
  const token = nanoid(48);
  db.insert(adminTokens).values({
    token,
    username: account.username,
    expiresAt: now + TOKEN_TTL,
  }).run();

  return { token, username: account.username };
}

/**
 * Verify a token and return the admin username, or null if invalid/expired.
 */
export function verifyToken(token: string): string | null {
  const db = getDb();
  const entry = db.select().from(adminTokens)
    .where(eq(adminTokens.token, token))
    .get();

  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    db.delete(adminTokens).where(eq(adminTokens.token, token)).run();
    return null;
  }
  return entry.username;
}

/**
 * Extract and verify admin token from Authorization header.
 * Returns admin username or null.
 */
export function getAdminFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  return verifyToken(token);
}
