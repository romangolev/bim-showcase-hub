import { useEffect, useId, useMemo, useState } from 'react';
import { NumberField } from '../components/NumberField.js';
import { StateBlock } from '../components/StateBlock.js';
import {
  COLOR_TOP_N_MAX,
  COLOR_TOP_N_MIN,
  colorByProperty,
} from '../extensions/colorBy.js';
import { colorByRules, ruleProperties } from '../extensions/colorRules.js';
import { readChartTheme, seriesColors } from '../extensions/dashboardData.js';
import { usePersisted } from '../storage.js';
import {
  applyColoring,
  currentColoring,
  useModelColoring,
} from '../viewer/modelColoring.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { ColorLegend } from './ColorLegend.js';
import { ColorRules } from './ColorRules.js';
import { CHART_SETTINGS } from './chartSettings.js';
import { COLORS_SETTINGS, type ColorsSettings } from './colorsSettings.js';
import { ScopedRowsStatus } from './ScopedRowsStatus.js';
import { usePropertyCatalog } from './usePropertyCatalog.js';
import { useResolvedAdapter, useScopedRows } from './useScopedRows.js';
import './panels.css';
import { Button, buttonClasses } from '../ui/Button.js';

export interface ColorsPanelProps {
  adapter?: ViewerAdapter | null;
}

export function ColorsPanel({ adapter }: ColorsPanelProps) {
  const uid = useId();
  const resolved = useResolvedAdapter(adapter);
  const [settings, setSettings] = usePersisted(COLORS_SETTINGS);
  const [chartSettings] = usePersisted(CHART_SETTINGS);
  const catalog = usePropertyCatalog(resolved);
  const [requested, setRequested] = useState(false);
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

  const next = useMemo(() => {
    if (state.status !== 'ready') return null;
    return rulesMode
      ? colorByRules(state.rows, settings.rules)
      : colorByProperty(state.rows, settings.spec, (labels) =>
          seriesColors(readChartTheme(), labels, chartSettings.palette),
        );
  }, [
    rulesMode,
    settings.rules,
    settings.spec,
    chartSettings.palette,
    state.status,
    state.rows,
  ]);
  const showsOwn =
    coloring?.origin === 'property' || coloring?.origin === 'rules';

  useEffect(() => {
    if (!resolved || !next || !(requested || showsOwn)) return;
    if (currentColoring(resolved) !== next) {
      applyColoring(resolved, next, {
        ghostRest: rulesMode && settings.rules.ghostRest,
      });
    }
    setRequested(false);
  }, [resolved, next, requested, showsOwn, rulesMode, settings.rules]);

  const update = (patch: Partial<ColorsSettings>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

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
              <label className={buttonClasses({})}>
                <input
                  type="radio"
                  name={uid}
                  checked={!rulesMode}
                  onChange={() => update({ source: 'property' })}
                />
                By property
              </label>
              <label className={buttonClasses({})}>
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
                  className="field"
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
                  className="field"
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
                      className="field field--narrow"
                    />
                  </label>
                ) : null}
              </>
            )}
            <div className="bsh-presets">
              <Button onClick={() => setRequested(true)}>
                Color the model
              </Button>
            </div>
            {state.status === 'idle' ? (
              <StateBlock
                variant="empty"
                compact
                title="No colours yet"
                message="Open a viewable version to colour its elements."
              />
            ) : null}
            <ScopedRowsStatus state={state} resolved={resolved} />
            {coloring ? (
              <ColorLegend
                adapter={resolved}
                coloring={coloring}
                onOverride={override}
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
