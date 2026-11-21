import { useEffect, useId, useMemo, useRef } from 'react';
import { NumberField } from '../components/NumberField.js';
import { StateBlock } from '../components/StateBlock.js';
import {
  COLOR_TOP_N_MAX,
  COLOR_TOP_N_MIN,
  colorByProperty,
  entryItems,
} from '../extensions/colorBy.js';
import {
  colorByRules,
  FALLBACK_LABEL,
  ruleProperties,
} from '../extensions/colorRules.js';
import { readChartTheme, seriesColors } from '../extensions/dashboardData.js';
import { usePersisted } from '../storage.js';
import { applyColoring, useModelColoring } from '../viewer/modelColoring.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { ColorLegend } from './ColorLegend.js';
import { ColorRules } from './ColorRules.js';
import { CHART_SETTINGS } from './chartSettings.js';
import { COLORS_SETTINGS, type ColorsSettings } from './colorsSettings.js';
import { usePropertyCatalog } from './usePropertyCatalog.js';
import {
  HIDDEN_MESSAGE,
  HIDDEN_TITLE,
  useResolvedAdapter,
  useScopedRows,
} from './useScopedRows.js';
import './panels.css';

export interface ColorsPanelProps {
  adapter?: ViewerAdapter | null;
}

export function ColorsPanel({ adapter }: ColorsPanelProps) {
  const uid = useId();
  const resolved = useResolvedAdapter(adapter);
  const [settings, setSettings] = usePersisted(COLORS_SETTINGS);
  const [chartSettings] = usePersisted(CHART_SETTINGS);
  const catalog = usePropertyCatalog(resolved);
  const ghostedRef = useRef(false);
  const rulesMode = settings.source === 'rules';
  const names = useMemo(
    () =>
      rulesMode ? ruleProperties(settings.rules) : [settings.spec.property],
    [rulesMode, settings.rules, settings.spec.property],
  );
  const state = useScopedRows(resolved, { names, autoRefresh: true });
  const coloring = useModelColoring(resolved);
  const properties = useMemo(() => {
    const list = new Set(catalog.catalog.map((info) => info.name));
    for (const name of ruleProperties(settings.rules)) list.add(name);
    list.add(settings.spec.property);
    return [...list];
  }, [catalog.catalog, settings.rules, settings.spec.property]);

  useEffect(() => {
    if (!resolved || !settings.active || state.status !== 'ready') return;
    const next = rulesMode
      ? colorByRules(state.rows, settings.rules)
      : colorByProperty(state.rows, settings.spec, (labels) =>
          seriesColors(readChartTheme(), labels, chartSettings.palette),
        );
    applyColoring(resolved, next);
    if (!rulesMode || !settings.rules.ghostRest || next.legend.length === 0) {
      if (ghostedRef.current) {
        resolved.isolateModelIds([]);
        resolved.setGhosting?.(false);
        ghostedRef.current = false;
      }
      return;
    }
    const items = next.legend.flatMap((entry, index) =>
      entry.label === FALLBACK_LABEL ? [] : entryItems(next, index),
    );
    resolved.isolateModelIds(items);
    resolved.setGhosting?.(true);
    ghostedRef.current = true;
  }, [
    resolved,
    settings.active,
    rulesMode,
    settings.rules,
    settings.spec,
    chartSettings.palette,
    state.status,
    state.rows,
  ]);

  useEffect(() => {
    if (!resolved || !ghostedRef.current) return;
    if (settings.active && rulesMode && settings.rules.ghostRest) return;
    resolved.isolateModelIds([]);
    resolved.setGhosting?.(false);
    ghostedRef.current = false;
  }, [resolved, settings.active, rulesMode, settings.rules.ghostRest]);

  const update = (patch: Partial<ColorsSettings>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  const clear = () => update({ active: false });

  const override =
    !rulesMode && coloring?.origin === 'property'
      ? (key: string, hex: string) =>
          update({
            spec: {
              ...settings.spec,
              overrides: { ...settings.spec.overrides, [key]: hex },
            },
          })
      : undefined;

  return (
    <section className="bsh-card bsh-drawer" aria-labelledby={`${uid}-title`}>
      <header className="bsh-card__header bsh-drawer__header">
        <h2 id={`${uid}-title`} className="bsh-card__title">
          Colors
        </h2>
      </header>
      <div className="bsh-drawer__body">
        {resolved ? (
          <>
            <fieldset className="bsh-kinds" aria-label="Colour by">
              <label className="bsh-button">
                <input
                  type="radio"
                  name={uid}
                  checked={!rulesMode}
                  onChange={() => {
                    if (rulesMode && resolved) {
                      resolved.isolateModelIds([]);
                      resolved.setGhosting?.(false);
                    }
                    update({ source: 'property' });
                  }}
                />
                By property
              </label>
              <label className="bsh-button">
                <input
                  type="radio"
                  name={uid}
                  checked={rulesMode}
                  onChange={() => update({ source: 'rules' })}
                />
                By rules
              </label>
            </fieldset>
            {rulesMode ? (
              <ColorRules
                value={settings.rules}
                onChange={(rules) => update({ rules })}
                properties={properties}
              />
            ) : (
              <>
                <select
                  className="bsh-select"
                  aria-label="Property"
                  value={settings.spec.property}
                  onChange={(event) =>
                    update({
                      spec: { ...settings.spec, property: event.target.value },
                    })
                  }
                >
                  {properties.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  className="bsh-select"
                  aria-label="Mode"
                  value={settings.spec.mode}
                  onChange={(event) =>
                    update({
                      spec: {
                        ...settings.spec,
                        mode:
                          event.target.value === 'range' ? 'range' : 'category',
                      },
                    })
                  }
                >
                  <option value="category">Values</option>
                  <option value="range">Ranges</option>
                </select>
                {settings.spec.mode === 'category' ? (
                  <label className="bsh-field">
                    Top values
                    <NumberField
                      value={settings.spec.topN}
                      min={COLOR_TOP_N_MIN}
                      max={COLOR_TOP_N_MAX}
                      onCommit={(topN) =>
                        update({ spec: { ...settings.spec, topN } })
                      }
                      className="bsh-input bsh-input--narrow"
                    />
                  </label>
                ) : null}
              </>
            )}
            <div className="bsh-presets">
              <button
                type="button"
                className="bsh-button"
                onClick={() => update({ active: true })}
              >
                Color the model
              </button>
            </div>
            {state.status === 'hidden' ? (
              <StateBlock
                variant="empty"
                compact
                title={HIDDEN_TITLE}
                message={HIDDEN_MESSAGE}
              />
            ) : null}
            {state.status === 'idle' ? (
              <StateBlock
                variant="empty"
                compact
                title="No colours yet"
                message="Open a viewable version to colour its elements."
              />
            ) : null}
            {state.status === 'loading' ? (
              <div className="bsh-summary__progress">
                <progress
                  aria-label="Reading element properties"
                  max={state.progress?.total || undefined}
                  value={state.progress ? state.progress.loaded : undefined}
                />
                <span role="status">
                  {state.progress && state.progress.total > 0
                    ? `Reading element properties: ${state.progress.loaded.toLocaleString('en-US')} of ${state.progress.total.toLocaleString('en-US')}${state.progress.partial ? ' (partial data)' : ''}`
                    : 'Reading element properties'}
                </span>
                <button
                  type="button"
                  className="bsh-button"
                  onClick={state.cancel}
                >
                  Cancel
                </button>
              </div>
            ) : null}
            {state.status === 'ready' && state.pending ? (
              <StateBlock
                variant="loading"
                compact
                message="Reading element properties"
                rows={3}
              />
            ) : null}
            {state.status === 'ready' && state.stale ? (
              <div className="bsh-summary__partial" role="status">
                <span>Data may be stale.</span>
                <button
                  type="button"
                  className="bsh-button"
                  onClick={state.refresh}
                >
                  Refresh
                </button>
              </div>
            ) : null}
            {state.status === 'error' ? (
              <StateBlock
                variant="error"
                compact
                message="We could not read this model's properties. Try again."
                detail={state.message}
                action={{ label: 'Retry', onClick: state.refresh }}
              />
            ) : null}
            {coloring ? (
              <ColorLegend
                adapter={resolved}
                coloring={coloring}
                onOverride={override}
                onCleared={clear}
              />
            ) : null}
          </>
        ) : (
          <StateBlock
            variant="empty"
            compact
            title="No colours yet"
            message="Open a viewable version to colour its elements."
          />
        )}
      </div>
    </section>
  );
}
