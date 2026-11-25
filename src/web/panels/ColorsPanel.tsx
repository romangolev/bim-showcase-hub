import { useEffect, useId, useMemo, useState } from 'react';
import { StateBlock } from '../components/StateBlock.js';
import {
  COLOR_TOP_N_MAX,
  COLOR_TOP_N_MIN,
  colorByProperty,
} from '../extensions/colorBy.js';
import { colorByRules, ruleProperties } from '../extensions/colorRules.js';
import { readChartTheme, seriesColors } from '../extensions/dashboardData.js';
import { usePersisted } from '../storage.js';
import { NumberField } from '../ui/NumberField.js';
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
import { CardTitle } from '../ui/Card.js';
import { Drawer, DrawerBody, DrawerHeader } from '../ui/Drawer.js';
import { FieldLabel } from '../ui/Field.js';
import { Radio, RadioGroup } from '../ui/Radio.js';
import { Select, SelectOption } from '../ui/Select.js';

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
    <Drawer aria-labelledby={`${uid}-title`}>
      <DrawerHeader>
        <CardTitle id={`${uid}-title`}>Colors</CardTitle>
      </DrawerHeader>
      <DrawerBody>
        {resolved ? (
          <>
            <RadioGroup
              className="bsh-kinds"
              aria-label="Colour by"
              name={uid}
              value={rulesMode ? 'rules' : 'property'}
              onValueChange={(next) =>
                update({ source: next === 'rules' ? 'rules' : 'property' })
              }
            >
              <label className={buttonClasses({})}>
                <Radio value="property" />
                By property
              </label>
              <label className={buttonClasses({})}>
                <Radio value="rules" />
                By rules
              </label>
            </RadioGroup>
            {rulesMode ? (
              <ColorRules
                value={settings.rules}
                onChange={(rules) => update({ rules })}
                properties={properties}
              />
            ) : (
              <>
                <Select
                  className="bsh-select"
                  aria-label="Property"
                  value={settings.spec.property}
                  onValueChange={(next) =>
                    update({
                      spec: { ...settings.spec, property: next },
                    })
                  }
                >
                  {properties.map((name) => (
                    <SelectOption key={name} value={name}>
                      {name}
                    </SelectOption>
                  ))}
                </Select>
                <Select
                  className="bsh-select"
                  aria-label="Mode"
                  value={settings.spec.mode}
                  onValueChange={(next) =>
                    update({
                      spec: {
                        ...settings.spec,
                        mode: next === 'range' ? 'range' : 'category',
                      },
                    })
                  }
                >
                  <SelectOption value="category">Values</SelectOption>
                  <SelectOption value="range">Ranges</SelectOption>
                </Select>
                {settings.spec.mode === 'category' ? (
                  <FieldLabel layout="inline" variant="quiet">
                    Top values
                    <NumberField
                      value={settings.spec.topN}
                      min={COLOR_TOP_N_MIN}
                      max={COLOR_TOP_N_MAX}
                      onValueCommitted={(topN) =>
                        update({ spec: { ...settings.spec, topN } })
                      }
                      className="field--narrow"
                    />
                  </FieldLabel>
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
      </DrawerBody>
    </Drawer>
  );
}
