import { useState } from 'react';
import { defaultScoreFormula, evaluateScoreFormula, validateUma, PRESET_RULESETS } from '@mahjong/shared';
import type { PresetName, Ruleset } from '@mahjong/shared';
import { useLocale } from '../../i18n';

interface RulesIslandProps {
  startingPoints: number;
  uma: [number, number, number, number];
  tobiEnabled: boolean;
  okaEnabled: boolean;
  kiriageMangan: boolean;
  doubleRonEnabled: boolean;
  nagashiManganEnabled: boolean;
  countedYakumanEnabled: boolean;
  doubleYakumanEnabled: boolean;
  multipleYakumanEnabled: boolean;
  scoreFormula: string;
  teamMode?: boolean;
  manganMinimum?: boolean;
  onlySubtract?: boolean;
  teammateNoTsumoPayment?: boolean;
  noRiichiDeposit?: boolean;
  scma2v2DrawPenalty?: boolean;
  presetName?: PresetName;
  editable: boolean;
  onChange?: (updates: Partial<Ruleset> & { presetName?: PresetName }) => void;
}

const STARTING_PRESETS = [25000, 30000];
const UMA_PRESETS: { label: string; value: [number, number, number, number] }[] = [
  { label: '+30/+10/-10/-30', value: [30, 10, -10, -30] },
  { label: '+20/+10/-10/-20', value: [20, 10, -10, -20] },
  { label: '+15/+5/-5/-15', value: [15, 5, -5, -15] },
  { label: '+10/+5/-5/-10', value: [10, 5, -5, -10] },
];

const PRESET_ORDER: PresetName[] = ['mleague', 'official', 'saikouisen', 'wrc', 'arule', 'scma2v2', 'custom'];

function formatUma(uma: [number, number, number, number]): string {
  return uma.map(v => (v > 0 ? `+${v}` : `${v}`)).join('/');
}

export function RulesIsland({
  startingPoints, uma, tobiEnabled, okaEnabled, kiriageMangan, doubleRonEnabled,
  nagashiManganEnabled, countedYakumanEnabled, doubleYakumanEnabled, multipleYakumanEnabled,
  scoreFormula, teamMode, manganMinimum, onlySubtract, teammateNoTsumoPayment, noRiichiDeposit,
  scma2v2DrawPenalty, presetName, editable, onChange,
}: RulesIslandProps) {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [customPoints, setCustomPoints] = useState('');
  const [editingFormula, setEditingFormula] = useState(false);
  const [formulaDraft, setFormulaDraft] = useState(scoreFormula);
  const [showCustomUma, setShowCustomUma] = useState(false);
  const [customUmaValues, setCustomUmaValues] = useState<[string, string, string, string]>(['', '', '', '']);

  const umaStr = formatUma(uma);
  const returnPoints = startingPoints + 5000;
  const okaTotal = okaEnabled ? (returnPoints - startingPoints) * 4 / 1000 : 0;
  const isPreset = presetName && presetName !== 'custom';

  // Preview: evaluate formula with example values
  const previewX = startingPoints + 10000;
  const previewY = uma[0];
  let formulaValid = true;
  try {
    const result = evaluateScoreFormula(formulaDraft, previewX, previewY);
    if (typeof result !== 'number' || !isFinite(result)) formulaValid = false;
  } catch {
    formulaValid = false;
  }

  function handleToggleExpand() {
    if (editable) setExpanded(!expanded);
  }

  function handlePresetSelect(name: PresetName) {
    if (name === 'custom') {
      onChange?.({ presetName: 'custom' });
      return;
    }
    const preset = PRESET_RULESETS[name];
    onChange?.({ ...preset, presetName: name });
    setFormulaDraft(preset.scoreFormula);
    setShowCustomUma(false);
    setEditingFormula(false);
  }

  function handleStartingPointsChange(pts: number) {
    const newReturn = pts + 5000;
    const newFormula = defaultScoreFormula(newReturn);
    onChange?.({ startingPoints: pts, scoreFormula: newFormula, presetName: 'custom' });
    setFormulaDraft(newFormula);
  }

  function handleFormulaConfirm() {
    if (formulaValid) {
      onChange?.({ scoreFormula: formulaDraft, presetName: 'custom' });
      setEditingFormula(false);
    }
  }

  function handleFormulaReset() {
    const def = defaultScoreFormula(returnPoints);
    setFormulaDraft(def);
    onChange?.({ scoreFormula: def, presetName: 'custom' });
    setEditingFormula(false);
  }

  function handleToggle(field: keyof Ruleset, value: boolean) {
    onChange?.({ [field]: value, presetName: 'custom' } as any);
  }

  return (
    <div className="mb-3">
      {/* Collapsed bar */}
      <button
        onClick={handleToggleExpand}
        className={`w-full px-4 py-2 rounded-xl bg-mahjong-card text-sm
          flex items-center justify-center gap-3 transition-colors
          ${editable ? 'active:bg-mahjong-accent/30 cursor-pointer' : 'cursor-default'}`}
      >
        {presetName && presetName !== 'custom' && (
          <span className="text-mahjong-highlight font-bold">{t(`preset.${presetName}` as any)}</span>
        )}
        <span className="text-mahjong-gold font-mono">{startingPoints.toLocaleString()}</span>
        <span className="text-mahjong-muted">Uma {umaStr}</span>
        <span className={tobiEnabled ? 'text-mahjong-highlight' : 'text-mahjong-muted'}>
          {tobiEnabled ? t('mahjong.tobi.enabled') : t('mahjong.tobi.disabled')}
        </span>
        {teamMode && (
          <span className="text-mahjong-green font-bold text-xs">2v2</span>
        )}
        {manganMinimum && (
          <span className="text-mahjong-highlight font-bold text-xs">{t('rules.manganMinimumShort')}</span>
        )}
        {editable && (
          <span className="text-mahjong-muted text-xs ml-1">{expanded ? '▲' : '▼'}</span>
        )}
      </button>

      {/* Expanded panel */}
      {expanded && editable && (
        <div className="mt-2 p-4 rounded-xl bg-mahjong-card space-y-4">
          <h3 className="text-sm font-bold text-mahjong-gold text-center">{t('rules.title')}</h3>

          {/* Preset Selector */}
          <div>
            <label className="block text-xs text-mahjong-muted mb-2">{t('preset.selectPreset')}</label>
            <div className="flex gap-1.5 flex-wrap">
              {PRESET_ORDER.map(name => (
                <button
                  key={name}
                  onClick={() => handlePresetSelect(name)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                    ${(presetName ?? 'mleague') === name
                      ? 'bg-mahjong-highlight text-mahjong-bg font-bold'
                      : 'bg-mahjong-bg text-mahjong-muted border border-mahjong-accent'}`}
                >
                  {t(`preset.${name}` as any)}
                </button>
              ))}
            </div>
          </div>

          {/* Starting Points */}
          <div className={isPreset ? 'opacity-50 pointer-events-none' : ''}>
            <label className="block text-xs text-mahjong-muted mb-2">{t('rules.startingPoints')}</label>
            <div className="flex gap-2 flex-wrap">
              {STARTING_PRESETS.map(pts => (
                <button
                  key={pts}
                  onClick={() => handleStartingPointsChange(pts)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-mono transition-colors
                    ${startingPoints === pts
                      ? 'bg-mahjong-gold text-mahjong-bg font-bold'
                      : 'bg-mahjong-bg text-mahjong-muted border border-mahjong-accent'}`}
                >
                  {pts.toLocaleString()}
                </button>
              ))}
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={customPoints}
                  onChange={e => setCustomPoints(e.target.value)}
                  placeholder={t('rules.custom')}
                  className="w-24 px-2 py-1.5 rounded-lg bg-mahjong-bg border border-mahjong-accent
                    text-white text-sm font-mono focus:outline-none focus:border-mahjong-highlight"
                />
                <button
                  onClick={() => {
                    const v = parseInt(customPoints);
                    if (v > 0) handleStartingPointsChange(v);
                  }}
                  disabled={!customPoints || parseInt(customPoints) <= 0}
                  className="px-2 py-1.5 rounded-lg bg-mahjong-accent text-white text-xs
                    disabled:opacity-30"
                >
                  {t('rules.ok')}
                </button>
              </div>
            </div>
          </div>

          {/* Uma */}
          <div className={isPreset ? 'opacity-50 pointer-events-none' : ''}>
            <label className="block text-xs text-mahjong-muted mb-2">{t('rules.uma')}</label>
            <div className="flex gap-2 flex-wrap">
              {UMA_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  onClick={() => { onChange?.({ uma: preset.value, presetName: 'custom' }); setShowCustomUma(false); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-mono transition-colors
                    ${!showCustomUma && umaStr === formatUma(preset.value)
                      ? 'bg-mahjong-gold text-mahjong-bg font-bold'
                      : 'bg-mahjong-bg text-mahjong-muted border border-mahjong-accent'}`}
                >
                  {preset.label}
                </button>
              ))}
              <button
                onClick={() => {
                  setShowCustomUma(!showCustomUma);
                  setCustomUmaValues([String(uma[0]), String(uma[1]), String(uma[2]), String(uma[3])]);
                }}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors
                  ${showCustomUma || !UMA_PRESETS.some(p => formatUma(p.value) === umaStr)
                    ? 'bg-mahjong-gold text-mahjong-bg font-bold'
                    : 'bg-mahjong-bg text-mahjong-muted border border-mahjong-accent'}`}
              >
                {t('rules.customUma')}
              </button>
            </div>

            {/* Custom Uma Inputs */}
            {showCustomUma && (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-4 gap-2">
                  {([t('rules.umaFirst'), t('rules.umaSecond'), t('rules.umaThird'), t('rules.umaFourth')] as const).map((label, i) => (
                    <div key={i}>
                      <label className="block text-xs text-mahjong-muted mb-1 text-center">{label}</label>
                      <input
                        type="number"
                        value={customUmaValues[i]}
                        onChange={e => {
                          const next = [...customUmaValues] as [string, string, string, string];
                          next[i] = e.target.value;
                          setCustomUmaValues(next);
                        }}
                        className="w-full px-2 py-1.5 rounded-lg bg-mahjong-bg border border-mahjong-accent
                          text-white text-sm font-mono text-center focus:outline-none focus:border-mahjong-highlight"
                      />
                    </div>
                  ))}
                </div>
                {(() => {
                  const parsed = customUmaValues.map(v => parseFloat(v) || 0) as [number, number, number, number];
                  const sum = parsed[0] + parsed[1] + parsed[2] + parsed[3];
                  const valid = validateUma(parsed) && customUmaValues.every(v => v !== '');
                  return (
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${valid ? 'text-mahjong-green' : 'text-mahjong-highlight'}`}>
                        {valid ? t('rules.umaSum', { sum: 0 }) : sum === 0 ? t('rules.umaSumError') : t('rules.umaSum', { sum })}
                      </span>
                      <button
                        onClick={() => {
                          if (valid) {
                            onChange?.({ uma: parsed, presetName: 'custom' });
                            setShowCustomUma(false);
                          }
                        }}
                        disabled={!valid}
                        className="px-4 py-1.5 rounded-lg bg-mahjong-green text-mahjong-bg text-xs font-bold
                          disabled:opacity-30"
                      >
                        {t('rules.apply')}
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Team mode toggle — always available regardless of preset */}
          <div className="space-y-3">
            <ToggleRow
              label={t('rules.teamMode')}
              desc={t('rules.teamModeDesc')}
              enabled={!!teamMode}
              color="green"
              onToggle={() => onChange?.({ teamMode: !teamMode })}
            />
          </div>

          {/* 2v2 special rules — shown when team mode is on */}
          {teamMode && (
            <div className={`space-y-3 border-t border-mahjong-accent/30 pt-3 ${isPreset ? 'opacity-50 pointer-events-none' : ''}`}>
              <h4 className="text-xs text-mahjong-highlight font-bold">{t('rules.scma2v2Title')}</h4>
              <ToggleRow
                label={t('rules.manganMinimum')}
                desc={t('rules.manganMinimumDesc')}
                enabled={!!manganMinimum}
                color="highlight"
                onToggle={() => handleToggle('manganMinimum', !manganMinimum)}
              />
              <ToggleRow
                label={t('rules.onlySubtract')}
                desc={t('rules.onlySubtractDesc')}
                enabled={!!onlySubtract}
                color="highlight"
                onToggle={() => handleToggle('onlySubtract', !onlySubtract)}
              />
              <ToggleRow
                label={t('rules.teammateNoTsumoPayment')}
                desc={t('rules.teammateNoTsumoPaymentDesc')}
                enabled={!!teammateNoTsumoPayment}
                color="green"
                onToggle={() => handleToggle('teammateNoTsumoPayment', !teammateNoTsumoPayment)}
              />
              <ToggleRow
                label={t('rules.noRiichiDeposit')}
                desc={t('rules.noRiichiDepositDesc')}
                enabled={!!noRiichiDeposit}
                color="gold"
                onToggle={() => handleToggle('noRiichiDeposit', !noRiichiDeposit)}
              />
              <ToggleRow
                label={t('rules.scma2v2DrawPenalty')}
                desc={t('rules.scma2v2DrawPenaltyDesc')}
                enabled={!!scma2v2DrawPenalty}
                color="gold"
                onToggle={() => handleToggle('scma2v2DrawPenalty', !scma2v2DrawPenalty)}
              />
            </div>
          )}

          {/* Toggle section */}
          <div className={`space-y-3 ${isPreset ? 'opacity-50 pointer-events-none' : ''}`}>
            {/* Tobi */}
            <ToggleRow
              label={t('rules.tobi')}
              desc={t('rules.tobiDesc')}
              enabled={tobiEnabled}
              color="highlight"
              onToggle={() => handleToggle('tobiEnabled', !tobiEnabled)}
            />

            {/* Oka */}
            <ToggleRow
              label={t('rules.oka')}
              desc={okaEnabled ? t('rules.okaValue', { total: okaTotal }) : t('rules.okaDisabled')}
              enabled={okaEnabled}
              color="green"
              onToggle={() => handleToggle('okaEnabled', !okaEnabled)}
            />

            {/* Kiriage Mangan */}
            <ToggleRow
              label={t('rules.kiriageMangan')}
              desc={t('rules.kiriageManganDesc')}
              enabled={kiriageMangan}
              color="gold"
              onToggle={() => handleToggle('kiriageMangan', !kiriageMangan)}
            />

            {/* Double Ron */}
            <ToggleRow
              label={t('rules.doubleRon')}
              desc={t('rules.doubleRonDesc')}
              enabled={doubleRonEnabled}
              color="gold"
              onToggle={() => handleToggle('doubleRonEnabled', !doubleRonEnabled)}
            />

            {/* Nagashi Mangan */}
            <ToggleRow
              label={t('rules.nagashiMangan')}
              desc={t('rules.nagashiManganDesc')}
              enabled={nagashiManganEnabled}
              color="gold"
              onToggle={() => handleToggle('nagashiManganEnabled', !nagashiManganEnabled)}
            />

            {/* Counted Yakuman */}
            <ToggleRow
              label={t('rules.countedYakuman')}
              desc={t('rules.countedYakumanDesc')}
              enabled={countedYakumanEnabled}
              color="gold"
              onToggle={() => handleToggle('countedYakumanEnabled', !countedYakumanEnabled)}
            />

            {/* Double Yakuman */}
            <ToggleRow
              label={t('rules.doubleYakuman')}
              desc={t('rules.doubleYakumanDesc')}
              enabled={doubleYakumanEnabled}
              color="gold"
              onToggle={() => handleToggle('doubleYakumanEnabled', !doubleYakumanEnabled)}
            />

            {/* Multiple Yakuman */}
            <ToggleRow
              label={t('rules.multipleYakuman')}
              desc={t('rules.multipleYakumanDesc')}
              enabled={multipleYakumanEnabled}
              color="gold"
              onToggle={() => handleToggle('multipleYakumanEnabled', !multipleYakumanEnabled)}
            />
          </div>

          {/* Score Formula */}
          <div className={`border-t border-mahjong-accent/30 pt-3 ${isPreset ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs text-mahjong-gold">{t('rules.scoreFormula')}</h4>
              {!editingFormula ? (
                <button
                  onClick={() => { setFormulaDraft(scoreFormula); setEditingFormula(true); }}
                  className="text-xs text-mahjong-muted px-2 py-0.5 rounded bg-mahjong-bg
                    border border-mahjong-accent"
                >
                  {t('rules.edit')}
                </button>
              ) : (
                <button
                  onClick={handleFormulaReset}
                  className="text-xs text-mahjong-muted px-2 py-0.5 rounded bg-mahjong-bg
                    border border-mahjong-accent"
                >
                  {t('rules.reset')}
                </button>
              )}
            </div>

            <div className="text-xs text-mahjong-muted mb-2">
              <p>{t('rules.formulaVars')}</p>
            </div>

            {editingFormula ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={formulaDraft}
                  onChange={e => setFormulaDraft(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg bg-mahjong-bg text-white text-sm font-mono
                    focus:outline-none border
                    ${formulaValid ? 'border-mahjong-accent focus:border-mahjong-highlight' : 'border-mahjong-highlight'}`}
                />
                {!formulaValid && (
                  <p className="text-xs text-mahjong-highlight">{t('rules.invalidFormula')}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleFormulaConfirm}
                    disabled={!formulaValid}
                    className="flex-1 py-1.5 rounded-lg bg-mahjong-green text-mahjong-bg text-xs font-bold
                      disabled:opacity-30"
                  >
                    {t('common.confirm')}
                  </button>
                  <button
                    onClick={() => setEditingFormula(false)}
                    className="flex-1 py-1.5 rounded-lg bg-mahjong-bg text-mahjong-muted text-xs
                      border border-mahjong-accent"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-3 py-2 rounded-lg bg-mahjong-bg font-mono text-sm text-white">
                Final = {scoreFormula}{okaEnabled ? ' + Oka' : ''}
              </div>
            )}
          </div>

          {/* Final score explanation */}
          <div className="border-t border-mahjong-accent/30 pt-3">
            <h4 className="text-xs text-mahjong-gold mb-1">{t('rules.scoring')}</h4>
            <div className="text-xs text-mahjong-muted space-y-0.5">
              <p>{t('rules.start')} = {startingPoints.toLocaleString()}</p>
              <p>{t('rules.return')} = {returnPoints.toLocaleString()}</p>
              <p>Uma = {umaStr}</p>
              {okaEnabled && <p>Oka = {t('rules.okaValue', { total: okaTotal })}</p>}
              <p className="text-white font-mono mt-1">
                Final = {scoreFormula}{okaEnabled ? ' + Oka(1st)' : ''}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleRow({ label, desc, enabled, color, onToggle }: {
  label: string;
  desc: string;
  enabled: boolean;
  color: 'highlight' | 'green' | 'gold';
  onToggle: () => void;
}) {
  const colorClass = {
    highlight: 'bg-mahjong-highlight',
    green: 'bg-mahjong-green',
    gold: 'bg-mahjong-gold',
  }[color];

  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-sm text-white">{label}</span>
        <p className="text-xs text-mahjong-muted">{desc}</p>
      </div>
      <button
        onClick={onToggle}
        className={`w-11 h-6 rounded-full p-0.5 transition-colors flex items-center
          ${enabled ? colorClass : 'bg-mahjong-bg border border-mahjong-accent'}`}
      >
        <span className={`w-5 h-5 rounded-full bg-white block transition-transform
          ${enabled ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </button>
    </div>
  );
}
