export type Wind = 'east' | 'south' | 'west' | 'north';

export const WINDS: Wind[] = ['east', 'south', 'west', 'north'];

export const WIND_LABELS: Record<Wind, string> = {
  east: '東',
  south: '南',
  west: '西',
  north: '北',
};

export interface Ruleset {
  startingPoints: number;
  returnPoints: number;
  uma: [number, number, number, number];
  tobiEnabled: boolean;
  scoreFormula: string; // Formula using X (raw points) and Y (uma). E.g., "(X - 30000) / 1000 + Y"
  okaEnabled: boolean;
  enchousenEnabled: boolean;
  doubleRonEnabled: boolean;
  countedYakumanEnabled: boolean;
  doubleYakumanEnabled: boolean;
  akadoraCount: number;
}

export function defaultScoreFormula(returnPoints: number): string {
  return `(X - ${returnPoints}) / 1000 + Y`;
}

export const PREDEFINED_TAGS = ['公式战'] as const;

export const M_LEAGUE_RULES: Ruleset = {
  startingPoints: 25000,
  returnPoints: 30000,
  uma: [30, 10, -10, -30],
  tobiEnabled: false,
  scoreFormula: '(X - 30000) / 1000 + Y',
  okaEnabled: true,
  enchousenEnabled: false,
  doubleRonEnabled: false,
  countedYakumanEnabled: false,
  doubleYakumanEnabled: false,
  akadoraCount: 3,
};
