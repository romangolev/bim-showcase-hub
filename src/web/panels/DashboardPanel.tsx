import { useEffect, useId, useMemo, useState } from 'react';
import { Icon } from '../components/icons.js';
import { StateBlock } from '../components/StateBlock.js';
import {
  availableProperties,
  bucketLabels,
  type ChartData,
  DEFAULT_DASHBOARD_PROPERTIES,
  DEFAULT_MAX_CATEGORIES,
  shapeChartData,
} from '../extensions/dashboardData.js';
import {
  DASHBOARD_PRESETS,
  PRESET_PROPERTIES,
  presetCharts,
} from '../extensions/dashboardPresets.js';
import {
  ACTION_LABELS,
  ELEMENT_ACTIONS,
  type ElementAction,
  itemsWithValues,
  runElementAction,
  sanitizeAction,
} from '../extensions/elementActions.js';
import { BSH_KEYS } from '../storage.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { ChartCanvas } from './ChartCanvas.js';
import {
  ModelScopeSelect,
  UnavailableModels,
  useModelScope,
} from './ModelScope.js';
import { usePersistedState } from './usePersistedState.js';
import {
  HIDDEN_MESSAGE,
  HIDDEN_TITLE,
  usePropertyRows,
  useResolvedAdapter,
} from './usePropertyRows.js';
import './panels.css';

export interface DashboardPanelProps {
  adapter?: ViewerAdapter | null;
  propertyNames?: readonly string[];
  defaultProperty?: string;
  maxCategories?: number;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  toggleable?: boolean;
  title?: string;
  className?: string;
}

export function DashboardPanel({
  adapter,
  propertyNames = DEFAULT_DASHBOARD_PROPERTIES,
  defaultProperty,
  maxCategories = DEFAULT_MAX_CATEGORIES,
  collapsed,
  defaultCollapsed = false,
  onCollapsedChange,
  toggleable = true,
  title = 'Dashboard',
  className,
}: DashboardPanelProps) {
  const uid = useId();
  const resolved = useResolvedAdapter(adapter);
  const [preset, setPreset] = useState<string | null>(null);
  const activePreset = DASHBOARD_PRESETS.find((p) => p.id === preset);
  const readNames = useMemo(
    () =>
      activePreset
        ? [...new Set([...propertyNames, ...PRESET_PROPERTIES])]
        : propertyNames,
    [activePreset, propertyNames],
  );
  const state = usePropertyRows(resolved, readNames);
  const scope = useModelScope(resolved, state.rows);
  const [innerCollapsed, setInnerCollapsed] = useState(defaultCollapsed);
  const isCollapsed = collapsed ?? innerCollapsed;
  const [selected, setSelected] = useState(defaultProperty ?? propertyNames[0]);

  const options = useMemo(
    () =>
      state.status === 'ready'
        ? availableProperties(scope.rows, propertyNames)
        : [],
    [state.status, scope.rows, propertyNames],
  );

  useEffect(() => {
    if (options.length > 0 && (!selected || !options.includes(selected))) {
      setSelected(options[0]);
    }
  }, [options, selected]);

  const chart = useMemo(
    () =>
      state.status === 'ready' && selected
        ? shapeChartData(scope.rows, selected, maxCategories)
        : null,
    [state.status, scope.rows, selected, maxCategories],
  );

  const [action, setAction] = usePersistedState<ElementAction>(
    BSH_KEYS.personal.dashboardAction,
    'select',
    sanitizeAction,
  );
  const board = useMemo(
    () =>
      state.status === 'ready' && activePreset
        ? presetCharts(activePreset, scope.rows).map((property) =>
            shapeChartData(scope.rows, property, maxCategories),
          )
        : [],
    [state.status, activePreset, scope.rows, maxCategories],
  );
  const exportName = resolved?.getModels()[0]?.name ?? 'model';
  const crossFilter = (chartData: ChartData) => (label: string) => {
    if (!resolved) return;
    runElementAction(
      resolved,
      action,
      itemsWithValues(
        scope.rows,
        chartData.property,
        bucketLabels(scope.rows, chartData, label),
      ),
    );
  };

  const toggle = () => {
    const next = !isCollapsed;
    if (collapsed === undefined) setInnerCollapsed(next);
    onCollapsedChange?.(next);
  };

  const bodyId = `${uid}-body`;
  const selectId = `${uid}-property`;

  return (
    <section
      className={`bsh-card bsh-drawer ${className ?? ''}`.trim()}
      aria-labelledby={`${uid}-title`}
      data-collapsed={isCollapsed}
    >
      <header className="bsh-card__header bsh-drawer__header">
        <h2 id={`${uid}-title`} className="bsh-card__title">
          {title}
        </h2>
        {toggleable ? (
          <button
            type="button"
            className="bsh-button"
            aria-expanded={!isCollapsed}
            aria-controls={bodyId}
            onClick={toggle}
          >
            <Icon
              name="chevron"
              size={16}
              className="bsh-drawer__toggle-icon"
              data-expanded={!isCollapsed}
            />
            <span className="bsh-drawer__toggle-label">
              {isCollapsed ? 'Expand' : 'Collapse'}
            </span>
          </button>
        ) : null}
        {!isCollapsed ? (
          <ModelScopeSelect state={scope} label="Chart models" />
        ) : null}
        {chart && options.length > 0 && !isCollapsed && !activePreset ? (
          <div className="bsh-field">
            <span aria-hidden="true">Group by</span>
            <label htmlFor={selectId} className="bsh-sr-only">
              Group elements by
            </label>
            <select
              id={selectId}
              className="bsh-select"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {options.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {!isCollapsed && state.status === 'ready' ? (
          <label className="bsh-field">
            <span aria-hidden="true">Chart click</span>
            <span className="bsh-sr-only">Chart click action</span>
            <select
              className="bsh-select"
              value={action}
              onChange={(e) => setAction(sanitizeAction(e.target.value))}
            >
              {ELEMENT_ACTIONS.map((name) => (
                <option key={name} value={name}>
                  {ACTION_LABELS[name]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>
      <div
        id={bodyId}
        className="bsh-drawer__body"
        inert={isCollapsed}
        aria-hidden={isCollapsed || undefined}
      >
        {!resolved && (
          <StateBlock
            variant="empty"
            compact
            title="No charts yet"
            message="Open a viewable version to chart its elements."
          />
        )}
        {state.status === 'hidden' && (
          <StateBlock
            variant="empty"
            compact
            title={HIDDEN_TITLE}
            message={HIDDEN_MESSAGE}
          />
        )}
        {resolved && state.status === 'loading' && (
          <StateBlock
            variant="loading"
            compact
            message="Reading element properties"
            rows={3}
          />
        )}
        {state.status === 'error' && (
          <StateBlock
            variant="error"
            compact
            message="We could not read this model's properties. Try again."
            detail={state.message}
            action={{ label: 'Retry', onClick: state.reload }}
          />
        )}
        {state.status === 'ready' ? (
          <UnavailableModels models={scope.unavailable} />
        ) : null}
        {state.status === 'ready' && options.length > 0 && (
          <div className="bsh-presets">
            <button
              type="button"
              className="bsh-button"
              aria-pressed={!activePreset}
              onClick={() => setPreset(null)}
            >
              Single chart
            </button>
            {DASHBOARD_PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="bsh-button"
                aria-pressed={preset === item.id}
                onClick={() => setPreset(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
        {activePreset && board.length === 0 && state.status === 'ready' && (
          <StateBlock
            variant="empty"
            compact
            title="Nothing to chart here"
            message={`This model has none of the properties ${activePreset.label} uses.`}
          />
        )}
        {activePreset && board.length > 0 && (
          <div className="bsh-boards">
            {board.map((item) => (
              <ChartCanvas
                key={item.property}
                kind="bar"
                chart={item}
                label={`Bar chart of element counts by ${item.property}`}
                exportName={exportName}
                onSelectLabel={crossFilter(item)}
              />
            ))}
          </div>
        )}
        {!activePreset && chart && options.length > 0 && (
          <>
            <div className="bsh-charts">
              <ChartCanvas
                kind="bar"
                chart={chart}
                label={`Bar chart of element counts by ${chart.property}`}
                exportName={exportName}
                onSelectLabel={crossFilter(chart)}
              />
              <ChartCanvas
                kind="doughnut"
                chart={chart}
                label={`Doughnut chart of element share by ${chart.property}`}
                exportName={exportName}
                onSelectLabel={crossFilter(chart)}
              />
            </div>
            <details className="bsh-details">
              <summary>Data table</summary>
              <table className="bsh-table">
                <caption className="bsh-sr-only">
                  Element counts by {chart.property}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{chart.property}</th>
                    <th scope="col" className="bsh-num">
                      Count
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {chart.data.map((d) => (
                    <tr key={d.label}>
                      <td>{d.label}</td>
                      <td className="bsh-num">{d.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
        {state.status === 'ready' && options.length === 0 && (
          <StateBlock
            variant="empty"
            compact
            title="Nothing to chart"
            message="This version has no properties to group elements by."
          />
        )}
      </div>
    </section>
  );
}
