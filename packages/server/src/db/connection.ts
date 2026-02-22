import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import * as schema from './schema.js';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { PREDEFINED_TAGS } from '@mahjong/shared';

let db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (db) return db;

  const dbPath = process.env.DATABASE_PATH || './data/mahjong.db';

  // Ensure directory exists
  mkdirSync(dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  db = drizzle(sqlite, { schema });

  // Run migrations inline (simple table creation)
  initializeTables(db);

  return db;
}

function initializeTables(db: ReturnType<typeof drizzle>) {
  db.run(sql`CREATE TABLE IF NOT EXISTS rooms (
    code TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    room_code TEXT REFERENCES rooms(code),
    name TEXT NOT NULL,
    seat_index INTEGER,
    joined_at INTEGER NOT NULL
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    room_code TEXT NOT NULL REFERENCES rooms(code),
    status TEXT NOT NULL,
    ruleset_json TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS hands (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id),
    hand_number INTEGER NOT NULL,
    round_wind TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    dealer_index INTEGER NOT NULL,
    honba INTEGER NOT NULL,
    riichi_sticks INTEGER NOT NULL,
    result_type TEXT NOT NULL,
    result_json TEXT NOT NULL,
    points_before TEXT NOT NULL,
    points_after TEXT NOT NULL,
    recorded_at INTEGER NOT NULL
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS final_scores (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id),
    player_index INTEGER NOT NULL,
    player_name TEXT NOT NULL,
    raw_points INTEGER NOT NULL,
    placement INTEGER NOT NULL,
    uma REAL NOT NULL,
    game_score REAL NOT NULL
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS admin_accounts (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS admin_tokens (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL REFERENCES admin_accounts(username),
    expires_at INTEGER NOT NULL
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS tags (
    name TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS registered_users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL DEFAULT '',
    email_verified INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);

  // Migrate old schema: add email columns if they don't exist
  try { db.run(sql`ALTER TABLE registered_users ADD COLUMN email TEXT NOT NULL DEFAULT ''`); } catch { /* already exists */ }
  try { db.run(sql`ALTER TABLE registered_users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0`); } catch { /* already exists */ }

  // Seed predefined tags
  const now = Date.now();
  for (const tagName of PREDEFINED_TAGS) {
    db.run(sql`INSERT OR IGNORE INTO tags (name, created_at) VALUES (${tagName}, ${now})`);
  }
}
