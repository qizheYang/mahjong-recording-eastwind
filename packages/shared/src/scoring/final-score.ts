import type { GamePlayer, FinalScore } from '../types/game.js';
import type { Ruleset } from '../constants.js';

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

  // Step 5: Build final scores
  // Oka: each player started with startingPoints but return is returnPoints
  // The difference (returnPoints - startingPoints) * 4 goes to 1st place
  // This is reflected by using returnPoints as the baseline:
  // gameScore = (rawPoints - returnPoints) / 1000 + uma
  // But the oka bonus (+20 for 1st) happens because:
  // sum of (pts - 25000)/1000 = 0 (points are conserved)
  // sum of uma = 0
  // But we subtract 30000 instead of 25000, creating a -5 per player = -20 total
  // That -20 is awarded as +20 oka to 1st place
  const okaTotal = (ruleset.returnPoints - ruleset.startingPoints) * 4 / 1000;

  return indexed.map((p, sortedIdx) => {
    const placement = placements[sortedIdx];
    const uma = umas[sortedIdx];
    const baseGameScore = (p.pts - ruleset.returnPoints) / 1000;
    const oka = placement === 1 ? okaTotal / placements.filter(pl => pl === 1).length : 0;
    const gameScore = baseGameScore + uma + oka;

    return {
      playerIndex: p.index,
      name: p.name,
      rawPoints: p.pts,
      placement,
      uma,
      gameScore: Math.round(gameScore * 10) / 10, // round to 1 decimal
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
