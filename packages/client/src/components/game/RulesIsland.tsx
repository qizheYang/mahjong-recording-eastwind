import { useState } from 'react';
import { defaultScoreFormula, evaluateScoreFormula } from '@mahjong/shared';
import { useLocale } from '../../i18n';

interface RulesIslandProps {
  startingPoints: number;
  uma: [number, number, number, number];
  tobiEnabled: boolean;
  okaEnabled: boolean;
  scoreFormula: string;
  editable: boolean;
  onChange?: (updates: {
    startingPoints?: number;
    uma?: [number, number, number, number];
    tobiEnabled?: boolean;
    okaEnabled?: boolean;
    scoreFormula?: string;
  }) => void;
}

const STARTING_PRESETS = [25000, 30000];
const UMA_PRESETS: { label: string; value: [number, number, number, number] }[] = [
  { label: '+30/+10/-10/-30', value: [30, 10, -10, -30] },
  { label: '+20/+10/-10/-20', value: [20, 10, -10, -20] },
  { label: '+10/+5/-5/-10', value: [10, 5, -5, -10] },
];

function formatUma(uma: [number, number, number, number]): string {
  return uma.map(v => (v > 0 ? `+${v}` : `${v}`)).join('/');
}

export function RulesIsland({
  startingPoints, uma, tobiEnabled, okaEnabled, scoreFormula,
  editable, onChange,
}: RulesIslandProps) {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [customPoints, setCustomPoints] = useState('');
  const [editingFormula, setEditingFormula] = useState(false);
  const [formulaDraft, setFormulaDraft] = useState(scoreFormula);

  const umaStr = formatUma(uma);
  const returnPoints = startingPoints + 5000;
  const okaTotal = okaEnabled ? (returnPoints - startingPoints) * 4 / 1000 : 0;

  // Preview: evaluate formula with example values
  const previewX = startingPoints + 10000; // example: won 10000
  const previewY = uma[0]; // 1st place uma
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

  function handleStartingPointsChange(pts: number) {
    const newReturn = pts + 5000;
    const newFormula = defaultScoreFormula(newReturn);
    onChange?.({ startingPoints: pts, scoreFormula: newFormula });
    setFormulaDraft(newFormula);
  }

  function handleFormulaConfirm() {
    if (formulaValid) {
      onChange?.({ scoreFormula: formulaDraft });
      setEditingFormula(false);
    }
  }

  function handleFormulaReset() {
    const def = defaultScoreFormula(returnPoints);
    setFormulaDraft(def);
    onChange?.({ scoreFormula: def });
    setEditingFormula(false);
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
        <span className="text-mahjong-gold font-mono">{startingPoints.toLocaleString()}</span>
        <span className="text-mahjong-muted">Uma {umaStr}</span>
        <span className={tobiEnabled ? 'text-mahjong-highlight' : 'text-mahjong-muted'}>
          {tobiEnabled ? t('mahjong.tobi.enabled') : t('mahjong.tobi.disabled')}
        </span>
        {editable && (
          <span className="text-mahjong-muted text-xs ml-1">{expanded ? '▲' : '▼'}</span>
        )}
      </button>

      {/* Expanded panel */}
      {expanded && editable && (
        <div className="mt-2 p-4 rounded-xl bg-mahjong-card space-y-4">
          <h3 className="text-sm font-bold text-mahjong-gold text-center">{t('rules.title')}</h3>

          {/* Starting Points */}
          <div>
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
          <div>
            <label className="block text-xs text-mahjong-muted mb-2">{t('rules.uma')}</label>
            <div className="flex gap-2 flex-wrap">
              {UMA_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  onClick={() => onChange?.({ uma: preset.value })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-mono transition-colors
                    ${umaStr === formatUma(preset.value)
                      ? 'bg-mahjong-gold text-mahjong-bg font-bold'
                      : 'bg-mahjong-bg text-mahjong-muted border border-mahjong-accent'}`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tobi */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-white">{t('rules.tobi')}</span>
              <p className="text-xs text-mahjong-muted">{t('rules.tobiDesc')}</p>
            </div>
            <button
              onClick={() => onChange?.({ tobiEnabled: !tobiEnabled })}
              className={`w-11 h-6 rounded-full p-0.5 transition-colors flex items-center
                ${tobiEnabled ? 'bg-mahjong-highlight' : 'bg-mahjong-bg border border-mahjong-accent'}`}
            >
              <span className={`w-5 h-5 rounded-full bg-white block transition-transform
                ${tobiEnabled ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>

          {/* Oka */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-white">{t('rules.oka')}</span>
              <p className="text-xs text-mahjong-muted">
                {okaEnabled ? t('rules.okaValue', { total: okaTotal }) : t('rules.okaDisabled')}
              </p>
            </div>
            <button
              onClick={() => onChange?.({ okaEnabled: !okaEnabled })}
              className={`w-11 h-6 rounded-full p-0.5 transition-colors flex items-center
                ${okaEnabled ? 'bg-mahjong-green' : 'bg-mahjong-bg border border-mahjong-accent'}`}
            >
              <span className={`w-5 h-5 rounded-full bg-white block transition-transform
                ${okaEnabled ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>

          {/* Score Formula */}
          <div className="border-t border-mahjong-accent/30 pt-3">
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
