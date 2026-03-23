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
  kiriageMangan: boolean;
  nagashiManganEnabled: boolean;
  multipleYakumanEnabled: boolean;
  akadoraCount: number;
  teamMode?: boolean;
  // SCMA 2v2 special rules
  manganMinimum?: boolean;           // 満贯縛り: sub-mangan wins treated as ryuukyoku
  onlySubtract?: boolean;            // 只减不加: winner gets 0 points, losers pay normally
  teammateNoTsumoPayment?: boolean;  // 队友自摸免付: teammate pays 0 on tsumo
  noRiichiDeposit?: boolean;         // 无立直拱托: riichi declaration doesn't cost 1000
  scma2v2DrawPenalty?: boolean;      // 2v2流局罚符: custom doubled draw penalty, teammates exempt
  maxHonba?: number;                 // 强制流局本场数: force draw when honba reaches this
  forcedTeamSeating?: boolean;       // 强制分队: East+North = Team A, South+West = Team B
}

export function defaultScoreFormula(returnPoints: number): string {
  return `(X - ${returnPoints}) / 1000 + Y`;
}

export const PREDEFINED_TAGS = ['公式战'] as const;

/**
 * Validate that uma values sum to 0.
 */
export function validateUma(uma: [number, number, number, number]): boolean {
  return uma[0] + uma[1] + uma[2] + uma[3] === 0;
}

export const YAKUMAN_LIST = [
  { id: 'kokushi', isDouble: false },
  { id: 'suuankou', isDouble: false },
  { id: 'daisangen', isDouble: false },
  { id: 'shousuushii', isDouble: false },
  { id: 'daisuushii', isDouble: true },
  { id: 'tsuiisou', isDouble: false },
  { id: 'chinroutou', isDouble: false },
  { id: 'ryuuiisou', isDouble: false },
  { id: 'chuuren', isDouble: false },
  { id: 'suukantsu', isDouble: false },
  { id: 'tenhou', isDouble: false },
  { id: 'chiihou', isDouble: false },
  // Double yakuman variants
  { id: 'suuankou_tanki', isDouble: true },
  { id: 'kokushi_13', isDouble: true },
  { id: 'junsei_chuuren', isDouble: true },
] as const;

export type YakumanId = typeof YAKUMAN_LIST[number]['id'];

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
  multipleYakumanEnabled: true,
  kiriageMangan: true,
  nagashiManganEnabled: true,
  akadoraCount: 3,
};

export type PresetName = 'mleague' | 'official' | 'saikouisen' | 'wrc' | 'arule' | 'scma2v2' | 'custom';

export const OFFICIAL_MATCH_RULES: Ruleset = {
  ...M_LEAGUE_RULES,
  tobiEnabled: true,
  doubleRonEnabled: true,
  countedYakumanEnabled: true,
};

export const SAIKOUISEN_RULES: Ruleset = {
  startingPoints: 30000,
  returnPoints: 30000,
  uma: [20, 10, -10, -20],
  tobiEnabled: false,
  scoreFormula: '(X - 30000) / 1000 + Y',
  okaEnabled: false,
  enchousenEnabled: false,
  doubleRonEnabled: false,
  countedYakumanEnabled: false,
  doubleYakumanEnabled: false,
  multipleYakumanEnabled: false,
  kiriageMangan: true,
  nagashiManganEnabled: false,
  akadoraCount: 0,
};

export const WRC_RULES: Ruleset = {
  startingPoints: 30000,
  returnPoints: 30000,
  uma: [15, 5, -5, -15],
  tobiEnabled: true,
  scoreFormula: '(X - 30000) / 1000 + Y',
  okaEnabled: false,
  enchousenEnabled: false,
  doubleRonEnabled: true,
  countedYakumanEnabled: true,
  doubleYakumanEnabled: false,
  multipleYakumanEnabled: true,
  kiriageMangan: true,
  nagashiManganEnabled: true,
  akadoraCount: 0,
};

export const A_RULE: Ruleset = {
  startingPoints: 30000,
  returnPoints: 30000,
  uma: [15, 5, -5, -15],
  tobiEnabled: false,
  scoreFormula: '(X - 30000) / 1000 + Y',
  okaEnabled: false,
  enchousenEnabled: false,
  doubleRonEnabled: false,
  countedYakumanEnabled: false,
  doubleYakumanEnabled: false,
  multipleYakumanEnabled: false,
  kiriageMangan: true,
  nagashiManganEnabled: false,
  akadoraCount: 0,
};

export const SCMA_2V2_RULES: Ruleset = {
  ...M_LEAGUE_RULES,
  uma: [0, 0, 0, 0],
  okaEnabled: false,
  tobiEnabled: false,
  doubleRonEnabled: false,
  nagashiManganEnabled: false,
  teamMode: true,
  manganMinimum: true,
  onlySubtract: true,
  teammateNoTsumoPayment: true,
  noRiichiDeposit: true,
  scma2v2DrawPenalty: true,
  maxHonba: 10,
  forcedTeamSeating: true,
};

export const PRESET_RULESETS: Record<Exclude<PresetName, 'custom'>, Ruleset> = {
  mleague: M_LEAGUE_RULES,
  official: OFFICIAL_MATCH_RULES,
  saikouisen: SAIKOUISEN_RULES,
  wrc: WRC_RULES,
  arule: A_RULE,
  scma2v2: SCMA_2V2_RULES,
};
