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
  startedAt: string;
  endedAt: string;
  totalHands: number;
}

const WIND_LABELS: Record<string, string> = {
  east: '東', south: '南', west: '西', north: '北',
};

/**
 * Save a completed game as a detailed JSON file.
 * Filename: YYYY-MM-DD_HHmmss_<roomCode>.json
 */
export function saveGameRecord(game: Game, finalScores: FinalScore[]): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
  const filename = `${timestamp}_${game.roomCode}.json`;
  const filepath = join(GAMES_DIR, filename);

  const record: GameRecord = {
    id: game.id,
    roomCode: game.roomCode,
    players: game.players.map(p => ({
      name: p.name,
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

      return {
        handNumber: hand.handNumber,
        round: roundLabel,
        dealer: game.players[hand.dealerIndex]?.name,
        honba: hand.honba,
        riichiSticksOnTable: hand.riichiSticksOnTable,
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
    startedAt: new Date(game.hands[0]?.recordedAt || Date.now()).toISOString(),
    endedAt: now.toISOString(),
    totalHands: game.hands.length,
  };

  writeFileSync(filepath, JSON.stringify(record, null, 2), 'utf-8');
  console.log(`Game record saved: ${filepath}`);
  return filename;
}

/**
 * List all saved game records.
 */
export function listGameRecords(): { filename: string; date: string; roomCode: string }[] {
  if (!existsSync(GAMES_DIR)) return [];

  return readdirSync(GAMES_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse()
    .map(f => {
      const parts = f.replace('.json', '').split('_');
      const dateStr = parts[0] || '';
      const timeStr = parts[1] || '';
      const roomCode = parts[2] || '';
      const date = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)} ${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:${timeStr.slice(4, 6)}`;
      return { filename: f, date, roomCode };
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
