import { useId, useMemo, useState } from 'react';
import { Icon } from '../components/icons.js';
import { StateBlock } from '../components/StateBlock.js';
import {
  availableProperties,
  bucketLabels,
  type ChartData,
  DEFAULT_DASHBOARD_PROPERTIES,
  shapeChartData,
} from '../extensions/dashboardData.js';
import {
  CHART_KINDS,
  DASHBOARD_PRESETS,
  type DashboardKind,
  KIND_LABELS,
  PRESET_PROPERTIES,
  presetCharts,
} from '../extensions/dashboardPresets.js';
import {
  type ElementAction,
  itemsWithValues,
  runElementAction,
  sanitizeAction,
} from '../extensions/elementActions.js';
import { BSH_KEYS } from '../storage.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { ChartCanvas } from './ChartCanvas.js';
import { useDashboardView } from './DashboardSettings.js';
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
  onOpenSettings?: () => void;
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
  onOpenSettings,
  collapsed,
  defaultCollapsed = false,
  onCollapsedChange,
  toggleable = true,
  title = 'Dashboard',
  className,
}: DashboardPanelProps) {
  const uid = useId();
  const resolved = useResolvedAdapter(adapter);
  const [view, setView] = useDashboardView();
  const { maxCategories } = view;
  const activePreset = DASHBOARD_PRESETS.find((p) => p.id === view.preset);
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

  const options = useMemo(
    () =>
      state.status === 'ready'
        ? availableProperties(scope.rows, propertyNames)
        : [],
    [state.status, scope.rows, propertyNames],
  );

  const selected = options.includes(view.property) ? view.property : options[0];

  const chart = useMemo(
    () =>
      state.status === 'ready' && selected
        ? shapeChartData(scope.rows, selected, maxCategories)
        : null,
    [state.status, scope.rows, selected, maxCategories],
  );

  const [action] = usePersistedState<ElementAction>(
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
        {!isCollapsed && state.status === 'ready' && options.length > 0 ? (
          <fieldset className="bsh-kinds" aria-label="Chart type">
            {CHART_KINDS.map((kind: DashboardKind) => (
              <button
                key={kind}
                type="button"
                className="bsh-button"
                aria-pressed={view.kind === kind}
                onClick={() => setView((prev) => ({ ...prev, kind }))}
              >
                {KIND_LABELS[kind]}
              </button>
            ))}
          </fieldset>
        ) : null}
        {onOpenSettings ? (
          <button
            type="button"
            className="bsh-icon-button"
            onClick={onOpenSettings}
          >
            <Icon name="settings" size={16} />
            <span className="bsh-sr-only">Dashboard settings</span>
          </button>
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
                kind={view.kind === 'doughnut' ? 'doughnut' : 'bar'}
                chart={item}
                label={`${view.kind === 'doughnut' ? 'Doughnut' : 'Bar'} chart of element ${view.kind === 'doughnut' ? 'share' : 'counts'} by ${item.property}`}
                exportName={exportName}
                onSelectLabel={crossFilter(item)}
              />
            ))}
          </div>
        )}
        {!activePreset && chart && options.length > 0 && (
          <>
            {selected !== view.property ? (
              <p className="bsh-muted">
                This model has no {view.property} values, so the chart groups by{' '}
                {selected}.
              </p>
            ) : null}
            <div
              className="bsh-charts"
              data-single={view.kind !== 'both' || undefined}
            >
              {view.kind !== 'doughnut' ? (
                <ChartCanvas
                  kind="bar"
                  chart={chart}
                  label={`Bar chart of element counts by ${chart.property}`}
                  exportName={exportName}
                  onSelectLabel={crossFilter(chart)}
                />
              ) : null}
              {view.kind !== 'bar' ? (
                <ChartCanvas
                  kind="doughnut"
                  chart={chart}
                  label={`Doughnut chart of element share by ${chart.property}`}
                  exportName={exportName}
                  onSelectLabel={crossFilter(chart)}
                />
              ) : null}
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
