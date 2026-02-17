import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { GameRecord } from './game-file-service.js';

const DATA_DIR = process.env.GAMES_DIR || join(process.cwd(), 'data', 'games');
const PLAYER_DB_PATH = join(DATA_DIR, '..', 'players.json');

mkdirSync(join(DATA_DIR, '..'), { recursive: true });

export interface PlayerGameEntry {
  filename: string;
  date: string;
  placement: number;
  rawPoints: number;
  gameScore: number;
  playerNames: string[]; // all players in the game
}

export interface PlayerRecord {
  name: string;
  phone?: string;
  games: PlayerGameEntry[];
  totalGames: number;
  avgPlacement: number;
  avgGameScore: number;
}

interface PlayerDB {
  players: Record<string, PlayerRecord>;
}

function loadDB(): PlayerDB {
  if (!existsSync(PLAYER_DB_PATH)) {
    return { players: {} };
  }
  try {
    return JSON.parse(readFileSync(PLAYER_DB_PATH, 'utf-8'));
  } catch {
    return { players: {} };
  }
}

function saveDB(db: PlayerDB): void {
  writeFileSync(PLAYER_DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

/**
 * Update player database after a game is saved.
 * Called alongside saveGameRecord.
 */
export function updatePlayerDB(record: GameRecord, filename: string): void {
  const db = loadDB();

  const allPlayerNames = record.players.map(p => p.name);

  for (const score of record.finalScores) {
    const key = score.name.toLowerCase();
    if (!db.players[key]) {
      db.players[key] = {
        name: score.name,
        games: [],
        totalGames: 0,
        avgPlacement: 0,
        avgGameScore: 0,
      };
    }

    const player = db.players[key];

    // Update phone if available
    const recordPlayer = record.players.find(p => p.name === score.name);
    if (recordPlayer?.phone) {
      player.phone = recordPlayer.phone;
    }

    // Avoid duplicate entries
    if (player.games.some(g => g.filename === filename)) continue;

    player.games.push({
      filename,
      date: record.endedAt,
      placement: score.placement,
      rawPoints: score.rawPoints,
      gameScore: score.gameScore,
      playerNames: allPlayerNames,
    });

    // Sort by date ascending
    player.games.sort((a, b) => a.date.localeCompare(b.date));

    player.totalGames = player.games.length;
    player.avgPlacement = player.games.reduce((s, g) => s + g.placement, 0) / player.totalGames;
    player.avgGameScore = player.games.reduce((s, g) => s + g.gameScore, 0) / player.totalGames;
  }

  saveDB(db);
}

/**
 * Get a player's record by name.
 */
export function getPlayer(name: string): PlayerRecord | null {
  const db = loadDB();
  return db.players[name.toLowerCase()] ?? null;
}

/**
 * List all players.
 */
export function listPlayers(): PlayerRecord[] {
  const db = loadDB();
  return Object.values(db.players).sort((a, b) => b.totalGames - a.totalGames);
}

/**
 * Search players by name or phone.
 */
export function searchPlayers(query: string): PlayerRecord[] {
  const db = loadDB();
  const q = query.toLowerCase();
  return Object.values(db.players).filter(p =>
    p.name.toLowerCase() === q ||
    (p.phone && p.phone === query)
  );
}

/**
 * Rebuild the player database from all game record files.
 * Useful for initial migration or recovery.
 */
export function rebuildPlayerDB(
  listFn: () => { filename: string }[],
  getFn: (filename: string) => GameRecord | null,
): number {
  const records = listFn();
  const db: PlayerDB = { players: {} };
  saveDB(db); // Reset

  let count = 0;
  for (const item of records) {
    const record = getFn(item.filename);
    if (record) {
      updatePlayerDB(record, item.filename);
      count++;
    }
  }
  return count;
}
