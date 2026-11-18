import { useEffect, useId, useMemo, useState } from 'react';
import { Icon } from '../components/icons.js';
import { StateBlock } from '../components/StateBlock.js';
import {
  availableProperties,
  bucketLabels,
  type ChartData,
  DEFAULT_DASHBOARD_PROPERTIES,
  selectedBuckets,
  shapeChartData,
} from '../extensions/dashboardData.js';
import {
  CHART_KINDS,
  DASHBOARD_PRESETS,
  type DashboardKind,
  type DashboardView,
  KIND_LABELS,
  PRESET_PROPERTIES,
  presetCharts,
} from '../extensions/dashboardPresets.js';
import {
  itemsWithValues,
  runElementAction,
} from '../extensions/elementActions.js';
import {
  PANE_SETTINGS,
  type PaneSetting,
  usePaneSetting,
} from '../settings/paneSettings.js';
import { ALL_MODELS } from '../viewer/modelScope.js';
import type { ModelDbId } from '../viewer/modelSet.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { ChartCanvas } from './ChartCanvas.js';
import {
  FailedModels,
  ModelScopeSelect,
  UnavailableModels,
} from './ModelScope.js';
import {
  HIDDEN_MESSAGE,
  HIDDEN_TITLE,
  useResolvedAdapter,
  useScopedRows,
} from './useScopedRows.js';
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
  setting?: PaneSetting<DashboardView>;
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
  setting,
}: DashboardPanelProps) {
  const uid = useId();
  const resolved = useResolvedAdapter(adapter);
  const [view, setView] = usePaneSetting(
    setting ?? PANE_SETTINGS.dashboard.view,
  );
  const { maxCategories } = view;
  const activePreset = DASHBOARD_PRESETS.find((p) => p.id === view.preset);
  const readNames = useMemo(
    () =>
      activePreset
        ? [...new Set([...propertyNames, ...PRESET_PROPERTIES])]
        : propertyNames,
    [activePreset, propertyNames],
  );
  const state = useScopedRows(resolved, {
    names: readNames,
    ...(setting
      ? {
          models: {
            value: view.scope ?? ALL_MODELS,
            onChange: (next: string) =>
              setView((prev) => ({ ...prev, scope: next })),
          },
        }
      : {}),
  });
  const [innerCollapsed, setInnerCollapsed] = useState(defaultCollapsed);
  const isCollapsed = collapsed ?? innerCollapsed;

  const options = useMemo(
    () =>
      state.status === 'ready'
        ? availableProperties(state.rows, propertyNames)
        : [],
    [state.status, state.rows, propertyNames],
  );

  const selected = options.includes(view.property) ? view.property : options[0];

  const chart = useMemo(
    () =>
      state.status === 'ready' && selected
        ? shapeChartData(state.rows, selected, maxCategories)
        : null,
    [state.status, state.rows, selected, maxCategories],
  );

  const [action] = usePaneSetting(PANE_SETTINGS.dashboard.action);
  const board = useMemo(
    () =>
      state.status === 'ready' && activePreset
        ? presetCharts(activePreset, state.rows).map((property) =>
            shapeChartData(state.rows, property, maxCategories),
          )
        : [],
    [state.status, activePreset, state.rows, maxCategories],
  );
  const [viewerSelection, setViewerSelection] = useState<ModelDbId[]>([]);
  useEffect(() => {
    if (!resolved) {
      setViewerSelection([]);
      return;
    }
    setViewerSelection(resolved.getModelSelection());
    return resolved.onSelectionChange(setViewerSelection);
  }, [resolved]);
  const highlights = useMemo(
    () =>
      new Map(
        [...board, ...(chart ? [chart] : [])].map((item) => [
          item,
          selectedBuckets(state.rows, item, viewerSelection),
        ]),
      ),
    [board, chart, state.rows, viewerSelection],
  );
  const highlightFor = (chartData: ChartData) => highlights.get(chartData);
  const exportName = resolved?.getModels()[0]?.name ?? 'model';
  const crossFilter = (chartData: ChartData) => (label: string) => {
    if (!resolved) return;
    runElementAction(
      resolved,
      action,
      itemsWithValues(
        state.rows,
        chartData.property,
        bucketLabels(state.rows, chartData, label),
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
          <ModelScopeSelect state={state.models} label="Chart models" />
        ) : null}
        {setting && !isCollapsed && !activePreset && options.length > 1 ? (
          <select
            className="bsh-select"
            aria-label="Group by"
            value={selected}
            onChange={(e) =>
              setView((prev) => ({ ...prev, property: e.target.value }))
            }
          >
            {options.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
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
          <>
            <UnavailableModels models={state.models.unavailable} />
            <FailedModels
              names={state.failed}
              unavailable={state.models.unavailable}
            />
          </>
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
                highlight={highlightFor(item)}
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
                  highlight={highlightFor(chart)}
                  onSelectLabel={crossFilter(chart)}
                />
              ) : null}
              {view.kind !== 'bar' ? (
                <ChartCanvas
                  kind="doughnut"
                  chart={chart}
                  label={`Doughnut chart of element share by ${chart.property}`}
                  exportName={exportName}
                  highlight={highlightFor(chart)}
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
