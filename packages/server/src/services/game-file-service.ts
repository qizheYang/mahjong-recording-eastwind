import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { Game, FinalScore } from '@mahjong/shared';

const GAMES_DIR = process.env.GAMES_DIR || join(process.cwd(), 'data', 'games');

// Ensure directory exists on import
mkdirSync(GAMES_DIR, { recursive: true });

export interface GameRecord {
  id: string;
  roomCode: string;
  players: {
    name: string;
    phone?: string;
    initialSeat: string;
  }[];
  ruleset: {
    startingPoints: number;
    returnPoints: number;
    uma: number[];
  };
  hands: {
    handNumber: number;
    round: string;         // e.g. "東1"
    dealer: string;        // dealer name
    honba: number;
    riichiSticksOnTable: number;
    result: {
      type: 'agari' | 'ryuukyoku';
      // agari fields
      winner?: string;
      loser?: string;
      method?: 'tsumo' | 'ron';
      han?: number;
      fu?: number;
      pointsWon?: number;
      honbaBonus?: number;
      riichiSticksCollected?: number;
      // ryuukyoku fields
      tenpaiPlayers?: string[];
    };
    pointsBefore: Record<string, number>;
    pointsAfter: Record<string, number>;
    pointDeltas: Record<string, number>;
  }[];
  finalScores: {
    placement: number;
    name: string;
    rawPoints: number;
    uma: number;
    gameScore: number;
  }[];
  interrupted?: boolean;
  startedAt: string;
  endedAt: string;
  totalHands: number;
  tags: string[];
  adminAnnotations?: {
    isOfficialGame: boolean;
    notes: string;
    annotatedBy: string;
    annotatedAt: string;
  };
}

const WIND_LABELS: Record<string, string> = {
  east: '東', south: '南', west: '西', north: '北',
};

const LA_TZ = 'America/Los_Angeles';

/** Format a Date as YYYY-MM-DDTHH:mm:ss in LA time */
function toLA_ISO(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LA_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

/** Format a Date as YYYYMMDDHHmmSS in LA time (for filenames) */
function toLA_Timestamp(date: Date): string {
  return toLA_ISO(date).replace(/[-T:]/g, '');
}

/**
 * Sanitize a player name for use in filenames.
 * CJK and other Unicode characters are kept as-is (modern OS/fs handle them fine).
 * Only strip characters that are truly forbidden in filenames.
 */
function sanitizeName(name: string): string {
  // Replace filesystem-forbidden chars and the dash separator we use
  return name
    .replace(/[\/\\:*?"<>|\s]/g, '_')  // forbidden in Windows/Linux filenames
    .replace(/-/g, '_')                  // dash is our separator
    .slice(0, 20)
    || 'player';                          // fallback if name becomes empty
}

/**
 * Save a completed game as a detailed JSON file.
 * Filename: YYYYMMDDHHmmSS-CODE-player1-player2-player3-player4.json
 */
export function saveGameRecord(game: Game, finalScores: FinalScore[], options?: { interrupted?: boolean }): string {
  const now = new Date();
  const timestamp = toLA_Timestamp(now);
  const playerNames = game.players.map(p => sanitizeName(p.name)).join('-');
  const filename = `${timestamp}-${game.roomCode}-${playerNames}.json`;
  const filepath = join(GAMES_DIR, filename);

  const record: GameRecord = {
    id: game.id,
    roomCode: game.roomCode,
    players: game.players.map(p => ({
      name: p.name,
      ...(p.phone ? { phone: p.phone } : {}),
      initialSeat: WIND_LABELS[p.initialSeat] || p.initialSeat,
    })),
    ruleset: {
      startingPoints: game.ruleset.startingPoints,
      returnPoints: game.ruleset.returnPoints,
      uma: [...game.ruleset.uma],
    },
    hands: game.hands.map(hand => {
      const r = hand.result;
      const pointsBefore: Record<string, number> = {};
      const pointsAfter: Record<string, number> = {};
      const pointDeltas: Record<string, number> = {};

      game.players.forEach((p, i) => {
        pointsBefore[p.name] = hand.pointsBefore[i];
        pointsAfter[p.name] = hand.pointsAfter[i];
        pointDeltas[p.name] = hand.pointsAfter[i] - hand.pointsBefore[i];
      });

      const roundLabel = `${WIND_LABELS[hand.round.wind] || hand.round.wind}${hand.round.number}`;

      const result: GameRecord['hands'][0]['result'] = { type: r.type };
      if (r.type === 'agari') {
        result.winner = game.players[r.winnerIndex]?.name;
        result.loser = r.loserIndex !== null ? game.players[r.loserIndex]?.name : undefined;
        result.method = r.isTsumo ? 'tsumo' : 'ron';
        result.han = r.han;
        result.fu = r.fu;
        result.pointsWon = r.pointsWon;
        result.honbaBonus = r.honbaBonus;
        result.riichiSticksCollected = r.riichiSticksCollected;
      } else {
        result.tenpaiPlayers = r.tenpaiStatus
          .map((t, i) => t ? game.players[i]?.name : null)
          .filter((n): n is string => n !== null);
      }

      const riichiPlayerNames = (hand.riichiPlayers ?? [])
        .map((r, i) => r ? game.players[i]?.name : null)
        .filter((n): n is string => n !== null);

      return {
        handNumber: hand.handNumber,
        round: roundLabel,
        dealer: game.players[hand.dealerIndex]?.name,
        honba: hand.honba,
        riichiSticksOnTable: hand.riichiSticksOnTable,
        ...(riichiPlayerNames.length > 0 ? { riichiPlayers: riichiPlayerNames } : {}),
        result,
        pointsBefore,
        pointsAfter,
        pointDeltas,
      };
    }),
    finalScores: finalScores.map(s => ({
      placement: s.placement,
      name: s.name,
      rawPoints: s.rawPoints,
      uma: s.uma,
      gameScore: s.gameScore,
    })),
    ...(options?.interrupted ? { interrupted: true } : {}),
    startedAt: toLA_ISO(new Date(game.hands[0]?.recordedAt || Date.now())),
    endedAt: toLA_ISO(now),
    totalHands: game.hands.length,
    tags: game.tags ?? [],
  };

  writeFileSync(filepath, JSON.stringify(record, null, 2), 'utf-8');
  console.log(`Game record saved: ${filepath}`);
  return filename;
}

/**
 * List all saved game records.
 */
export function listGameRecords(): { filename: string; date: string; roomCode: string; players: string; tags: string[]; isOfficialGame: boolean; interrupted: boolean; finalScores: { placement: number; name: string; rawPoints: number; gameScore: number }[] }[] {
  if (!existsSync(GAMES_DIR)) return [];

  return readdirSync(GAMES_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse()
    .map(f => {
      // Format: YYYYMMDDHHmmSS-CODE-p1-p2-p3-p4.json
      const base = f.replace('.json', '');
      const firstDash = base.indexOf('-');
      const secondDash = base.indexOf('-', firstDash + 1);
      const timestamp = base.slice(0, firstDash);
      const roomCode = base.slice(firstDash + 1, secondDash);
      const players = base.slice(secondDash + 1);
      const date = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)} ${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:${timestamp.slice(12, 14)}`;

      let tags: string[] = [];
      let isOfficialGame = false;
      let interrupted = false;
      let finalScores: { placement: number; name: string; rawPoints: number; gameScore: number }[] = [];
      try {
        const record = JSON.parse(readFileSync(join(GAMES_DIR, f), 'utf-8'));
        tags = record.tags ?? [];
        isOfficialGame = record.adminAnnotations?.isOfficialGame ?? false;
        interrupted = record.interrupted ?? false;
        finalScores = (record.finalScores ?? []).map((s: any) => ({
          placement: s.placement,
          name: s.name,
          rawPoints: s.rawPoints,
          gameScore: s.gameScore,
        }));
      } catch { /* ignore */ }

      return { filename: f, date, roomCode, players, tags, isOfficialGame, interrupted, finalScores };
    });
}

/**
 * Read a specific game record.
 */
export function getGameRecord(filename: string): GameRecord | null {
  // Security: prevent directory traversal
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return null;
  }
  const filepath = join(GAMES_DIR, filename);
  if (!existsSync(filepath)) return null;

  try {
    return JSON.parse(readFileSync(filepath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Update tags on a game record.
 */
export function updateGameTags(
  filename: string,
  newTags: string[]
): GameRecord | null {
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return null;
  }
  const filepath = join(GAMES_DIR, filename);
  if (!existsSync(filepath)) return null;

  try {
    const record: GameRecord = JSON.parse(readFileSync(filepath, 'utf-8'));
    record.tags = newTags;
    writeFileSync(filepath, JSON.stringify(record, null, 2), 'utf-8');
    return record;
  } catch {
    return null;
  }
}

/**
 * Update admin annotations on a game record.
 */
export function updateGameAnnotations(
  filename: string,
  annotations: { isOfficialGame: boolean; notes: string; annotatedBy: string }
): GameRecord | null {
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return null;
  }
  const filepath = join(GAMES_DIR, filename);
  if (!existsSync(filepath)) return null;

  try {
    const record: GameRecord = JSON.parse(readFileSync(filepath, 'utf-8'));
    record.adminAnnotations = {
      isOfficialGame: annotations.isOfficialGame,
      notes: annotations.notes,
      annotatedBy: annotations.annotatedBy,
      annotatedAt: new Date().toISOString(),
    };
    writeFileSync(filepath, JSON.stringify(record, null, 2), 'utf-8');
    return record;
  } catch {
    return null;
  }
}
