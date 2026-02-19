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

export function formatRound(round: Round, t?: (key: string) => string): string {
  const windLabel = t ? t(`mahjong.wind.${round.wind}`) : WIND_LABELS[round.wind as Wind];
  const suffix = t ? t('mahjong.round') : '局';
  return `${windLabel}${round.number}${suffix}`;
}

export function formatGameScore(score: number): string {
  const sign = score > 0 ? '+' : '';
  return `${sign}${score.toFixed(1)}`;
}

export function formatWind(wind: Wind, t?: (key: string) => string): string {
  return t ? t(`mahjong.wind.${wind}`) : WIND_LABELS[wind];
}
