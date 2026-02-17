import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import { nanoid } from 'nanoid';

const DATA_DIR = process.env.GAMES_DIR || join(process.cwd(), 'data', 'games');
const ADMIN_DB_PATH = join(DATA_DIR, '..', 'admins.json');

mkdirSync(join(DATA_DIR, '..'), { recursive: true });

interface AdminAccount {
  username: string;
  passwordHash: string; // hex-encoded scrypt hash
  salt: string;         // hex-encoded salt
}

interface TokenEntry {
  username: string;
  expiresAt: number; // epoch ms
}

interface AdminDB {
  accounts: AdminAccount[];
  tokens: Record<string, TokenEntry>;
}

const TOKEN_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

function loadDB(): AdminDB {
  if (!existsSync(ADMIN_DB_PATH)) {
    return { accounts: [], tokens: {} };
  }
  try {
    return JSON.parse(readFileSync(ADMIN_DB_PATH, 'utf-8'));
  } catch {
    return { accounts: [], tokens: {} };
  }
}

function saveDB(db: AdminDB): void {
  writeFileSync(ADMIN_DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex');
}

/**
 * Create an admin account. Called by the server owner (e.g., via a CLI script).
 */
export function createAdmin(username: string, password: string): void {
  const db = loadDB();
  const existing = db.accounts.find(a => a.username.toLowerCase() === username.toLowerCase());
  if (existing) {
    throw new Error(`Admin "${username}" already exists`);
  }

  const salt = randomBytes(32).toString('hex');
  const passwordHash = hashPassword(password, salt);

  db.accounts.push({ username, passwordHash, salt });
  saveDB(db);
}

/**
 * Verify admin credentials and return a session token.
 */
export function signIn(username: string, password: string): { token: string; username: string } | null {
  const db = loadDB();
  const account = db.accounts.find(a => a.username.toLowerCase() === username.toLowerCase());
  if (!account) return null;

  const hash = scryptSync(password, account.salt, 64);
  const storedHash = Buffer.from(account.passwordHash, 'hex');
  if (!timingSafeEqual(hash, storedHash)) return null;

  // Clean expired tokens
  const now = Date.now();
  for (const [tok, entry] of Object.entries(db.tokens)) {
    if (entry.expiresAt < now) delete db.tokens[tok];
  }

  // Create new token
  const token = nanoid(48);
  db.tokens[token] = { username: account.username, expiresAt: now + TOKEN_TTL };
  saveDB(db);

  return { token, username: account.username };
}

/**
 * Verify a token and return the admin username, or null if invalid/expired.
 */
export function verifyToken(token: string): string | null {
  const db = loadDB();
  const entry = db.tokens[token];
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    delete db.tokens[token];
    saveDB(db);
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
