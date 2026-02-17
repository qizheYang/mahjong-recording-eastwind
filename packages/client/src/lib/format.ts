import type { Wind, Round } from '@mahjong/shared';
import { WIND_LABELS } from '@mahjong/shared';

export function formatPoints(points: number): string {
  if (points >= 0) {
    return points.toLocaleString();
  }
  return `-${Math.abs(points).toLocaleString()}`;
}

export function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta.toLocaleString()}`;
  if (delta < 0) return `${delta.toLocaleString()}`;
  return '±0';
}

export function formatRound(round: Round): string {
  return `${WIND_LABELS[round.wind as Wind]}${round.number}局`;
}

export function formatGameScore(score: number): string {
  const sign = score > 0 ? '+' : '';
  return `${sign}${score.toFixed(1)}`;
}

export function formatWind(wind: Wind): string {
  return WIND_LABELS[wind];
}
