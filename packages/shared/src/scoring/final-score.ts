import type { GamePlayer, FinalScore } from '../types/game.js';
import type { Ruleset } from '../constants.js';

/**
 * Evaluate a score formula string with X (raw points) and Y (uma).
 * Falls back to standard calculation on error.
 */
export function evaluateScoreFormula(formula: string, x: number, y: number): number {
  try {
    const fn = new Function('X', 'Y', `"use strict"; return (${formula});`);
    const result = fn(x, y);
    if (typeof result !== 'number' || !isFinite(result)) {
      return (x - 30000) / 1000 + y;
    }
    return result;
  } catch {
    return (x - 30000) / 1000 + y;
  }
}

/**
 * Calculate final scores including uma and oka.
 * Remaining riichi sticks are awarded to the highest scorer.
 */
export function calculateFinalScores(
  players: GamePlayer[],
  riichiSticksOnTable: number,
  ruleset: Ruleset,
): FinalScore[] {
  // Step 1: Award remaining riichi sticks to highest scorer
  const points = players.map(p => p.points);
  if (riichiSticksOnTable > 0) {
    const maxPoints = Math.max(...points);
    const maxIndex = points.indexOf(maxPoints);
    points[maxIndex] += riichiSticksOnTable * 1000;
  }

  // Step 2: Sort by points descending, keeping original indices
  const indexed = points.map((pts, i) => ({ pts, index: i, name: players[i].name }));
  indexed.sort((a, b) => b.pts - a.pts);

  // Step 3: Assign placements (handle ties)
  const placements = assignPlacements(indexed.map(p => p.pts));

  // Step 4: Calculate uma with tie-sharing
  const umas = calculateSharedUma(placements, ruleset.uma);

  // Step 5: Build final scores using custom formula or standard calculation
  const okaTotal = ruleset.okaEnabled
    ? (ruleset.returnPoints - ruleset.startingPoints) * 4 / 1000
    : 0;

  return indexed.map((p, sortedIdx) => {
    const placement = placements[sortedIdx];
    const uma = umas[sortedIdx];
    const oka = placement === 1 ? okaTotal / placements.filter(pl => pl === 1).length : 0;

    let gameScore: number;
    if (ruleset.scoreFormula) {
      gameScore = evaluateScoreFormula(ruleset.scoreFormula, p.pts, uma) + oka;
    } else {
      const baseGameScore = (p.pts - ruleset.returnPoints) / 1000;
      gameScore = baseGameScore + uma + oka;
    }

    return {
      playerIndex: p.index,
      name: p.name,
      rawPoints: p.pts,
      placement,
      uma,
      gameScore: Math.round(gameScore * 10) / 10,
    };
  });
}

function assignPlacements(sortedPoints: number[]): number[] {
  const placements: number[] = [];
  let currentPlacement = 1;

  for (let i = 0; i < sortedPoints.length; i++) {
    if (i > 0 && sortedPoints[i] === sortedPoints[i - 1]) {
      placements.push(placements[i - 1]);
    } else {
      placements.push(currentPlacement);
    }
    currentPlacement++;
  }

  return placements;
}

function calculateSharedUma(
  placements: number[],
  uma: [number, number, number, number],
): number[] {
  const result: number[] = new Array(placements.length).fill(0);
  const groups = new Map<number, number[]>();

  placements.forEach((p, i) => {
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p)!.push(i);
  });

  let umaIndex = 0;
  const sortedPlacements = [...groups.keys()].sort((a, b) => a - b);

  for (const placement of sortedPlacements) {
    const indices = groups.get(placement)!;
    const count = indices.length;
    // Sum the uma values for the positions these tied players occupy
    let umaSum = 0;
    for (let j = 0; j < count; j++) {
      umaSum += uma[umaIndex + j];
    }
    const sharedUma = umaSum / count;
    indices.forEach(i => { result[i] = sharedUma; });
    umaIndex += count;
  }

  return result;
}
