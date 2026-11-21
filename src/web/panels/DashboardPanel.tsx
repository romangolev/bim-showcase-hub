import { useEffect, useId, useMemo, useState } from 'react';
import { Icon } from '../components/icons.js';
import { StateBlock } from '../components/StateBlock.js';
import { colorByChart } from '../extensions/colorBy.js';
import {
  AGGREGATE_LABELS,
  availableProperties,
  bucketLabels,
  buildChart,
  type ChartData,
  type ChartType,
  selectedBuckets,
} from '../extensions/dashboardData.js';
import {
  CHART_KINDS,
  DASHBOARD_PRESETS,
  type DashboardKind,
  type DashboardView,
  KIND_LABELS,
  PRESET_PROPERTIES,
  presetCharts,
  viewSpec,
} from '../extensions/dashboardPresets.js';
import {
  itemsWithValues,
  runElementAction,
} from '../extensions/elementActions.js';
import { type HealthKpiTile, healthKpis } from '../extensions/healthKpis.js';
import { formatCount, localeOf } from '../i18n/format.js';
import { PANE_SETTINGS } from '../settings/paneSettings.js';
import { useSettings } from '../settings/SettingsContext.js';
import { type PersistedRecord, usePersisted } from '../storage.js';
import { notify } from '../tasks/notifications.js';
import { applyColoring } from '../viewer/modelColoring.js';
import { ALL_MODELS } from '../viewer/modelScope.js';
import { splitByModel } from '../viewer/modelSeries.js';
import type { ModelDbId } from '../viewer/modelSet.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { ChartCanvas, type ChartKind, ChartTable } from './ChartCanvas.js';
import { CHART_SETTINGS } from './chartSettings.js';
import { DashboardGallery } from './DashboardGallery.js';
import { ElementScopeSelect, scopeName } from './ElementScope.js';
import { HEALTH_KPI_SETTINGS, HealthKpis } from './HealthKpis.js';
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
  onOpenSettings?: () => void;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  toggleable?: boolean;
  title?: string;
  className?: string;
  setting?: PersistedRecord<DashboardView>;
}

const CANVAS_KIND: Record<Exclude<ChartType, 'table'>, ChartKind> = {
  bar: 'bar',
  hbar: 'hbar',
  doughnut: 'doughnut',
};

const AGGREGATE_PAST: Record<string, string> = {
  sum: 'total',
  avg: 'average',
  min: 'minimum',
  max: 'maximum',
};

function chartLabel(chart: ChartData, type: ChartType): string {
  const aggregate = chart.aggregate ?? 'count';
  const measure = chart.measure ?? chart.property;
  const unit = chart.unit ? ` (${chart.unit})` : '';
  if (type === 'table') {
    return aggregate === 'count'
      ? `Element counts by ${chart.property}`
      : `${AGGREGATE_LABELS[aggregate]} of ${measure}${unit} by ${chart.property}`;
  }
  if (aggregate === 'count') {
    if (type === 'hbar') {
      return `Horizontal bar chart of element counts by ${chart.property}`;
    }
    if (type === 'doughnut') {
      return `Doughnut chart of element share by ${chart.property}`;
    }
    return `Bar chart of element counts by ${chart.property}`;
  }
  const what = `${AGGREGATE_PAST[aggregate] ?? aggregate} ${measure}${unit}`;
  if (type === 'hbar') {
    return `Horizontal bar chart of ${what} by ${chart.property}`;
  }
  if (type === 'doughnut') {
    return `Doughnut chart of ${what} by ${chart.property}`;
  }
  return `Bar chart of ${what} by ${chart.property}`;
}

export function DashboardPanel({
  adapter,
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
  const { language } = useSettings().settings;
  const resolved = useResolvedAdapter(adapter);
  const [view, setView] = usePersisted(setting ?? PANE_SETTINGS.dashboard.view);
  const [health] = usePersisted(HEALTH_KPI_SETTINGS);
  const [chartSettings] = usePersisted(CHART_SETTINGS);
  const spec = viewSpec(view);
  const propertyNames = view.properties;
  const activePreset = DASHBOARD_PRESETS.find((p) => p.id === view.preset);
  const readNames = useMemo(() => {
    const names = new Set(propertyNames);
    if (view.property) names.add(view.property);
    if (spec.aggregate !== 'count' && spec.measure) names.add(spec.measure);
    if (!setting) {
      for (const name of health.mustHave) names.add(name);
      for (const name of health.unique) names.add(name);
      if (health.measure) names.add(health.measure);
    }
    if (activePreset) for (const name of PRESET_PROPERTIES) names.add(name);
    return [...names];
  }, [
    propertyNames,
    view.property,
    spec.aggregate,
    spec.measure,
    setting,
    health,
    activePreset,
  ]);
  const state = useScopedRows(resolved, {
    names: readNames,
    elements: view.elements ?? 'all',
    autoRefresh: false,
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
  const [galleryOpen, setGalleryOpen] = useState(false);
  const isCollapsed = collapsed ?? innerCollapsed;

  const usable = state.status === 'ready' || state.status === 'cancelled';

  const options = useMemo(
    () =>
      state.rows.length > 0
        ? availableProperties(state.rows, propertyNames)
        : [],
    [state.rows, propertyNames],
  );

  const selected = options.includes(view.property) ? view.property : options[0];

  const chart = useMemo(() => {
    if (!usable || !selected || activePreset) return null;
    const shaped = buildChart(state.rows, {
      property: selected,
      aggregate: spec.aggregate,
      measure: spec.measure,
      topN: spec.topN,
      otherBucket: spec.otherBucket,
    });
    return view.splitByModel ? splitByModel(shaped, state.rows) : shaped;
  }, [
    usable,
    state.rows,
    selected,
    activePreset,
    spec.aggregate,
    spec.measure,
    spec.topN,
    spec.otherBucket,
    view.splitByModel,
  ]);

  const [action] = usePersisted(PANE_SETTINGS.dashboard.action);
  const board = useMemo(
    () =>
      usable && activePreset
        ? presetCharts(activePreset, state.rows).map((property) =>
            buildChart(state.rows, {
              property,
              aggregate: spec.aggregate,
              measure: spec.measure,
              topN: spec.topN,
              otherBucket: spec.otherBucket,
            }),
          )
        : [],
    [
      usable,
      activePreset,
      state.rows,
      spec.aggregate,
      spec.measure,
      spec.topN,
      spec.otherBucket,
    ],
  );
  const settled = usable && !state.pending;
  const hasRows = settled && state.rows.length > 0;
  const emptyScope =
    settled && state.rows.length === 0 && state.elements !== 'all';
  const emptyBoard =
    hasRows && activePreset !== undefined && board.length === 0;
  const showGallery = galleryOpen || !resolved || emptyBoard;
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
  const colorModel = (chartData: ChartData) => (colors: readonly string[]) => {
    if (!resolved) return;
    applyColoring(resolved, colorByChart(state.rows, chartData, colors));
    notify(`Model coloured by ${chartData.property}`);
  };

  const kpiTiles = useMemo(
    () =>
      settled && !setting && state.rows.length > 0
        ? healthKpis(state.rows, health)
        : [],
    [settled, setting, state.rows, health],
  );
  const pickKpi = (tile: HealthKpiTile) => {
    if (!resolved) return;
    runElementAction(resolved, action, tile.offenders);
  };

  const toggle = () => {
    const next = !isCollapsed;
    if (collapsed === undefined) setInnerCollapsed(next);
    onCollapsedChange?.(next);
  };

  const setKind = (kind: DashboardKind) =>
    setView((prev) => ({
      ...prev,
      kind,
      chartType: kind === 'doughnut' ? 'doughnut' : 'bar',
    }));

  const legacyPair = view.kind === 'both' && spec.chartType === 'bar';
  const chartType: ChartType = spec.chartType;

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
        {!isCollapsed ? (
          <ElementScopeSelect
            value={view.elements ?? 'all'}
            onChange={(next) =>
              setView((prev) => ({ ...prev, elements: next }))
            }
            label="Chart elements"
          />
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
                onClick={() => setKind(kind)}
              >
                {KIND_LABELS[kind]}
              </button>
            ))}
          </fieldset>
        ) : null}
        {!isCollapsed && resolved && !emptyBoard ? (
          <button
            type="button"
            className="bsh-button"
            aria-expanded={galleryOpen}
            aria-controls={`${uid}-gallery`}
            onClick={() => setGalleryOpen((open) => !open)}
          >
            Presets
          </button>
        ) : null}
        <button
          type="button"
          className="bsh-button"
          onClick={state.refresh}
          disabled={!resolved}
        >
          Refresh
        </button>
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
        {resolved && state.status === 'loading' ? (
          <div className="bsh-summary__progress">
            <progress
              aria-label="Reading element properties"
              max={state.progress?.total || undefined}
              value={state.progress ? state.progress.loaded : undefined}
            />
            <span role="status">
              {state.progress && state.progress.total > 0
                ? `Reading element properties: ${formatCount(state.progress.loaded, language)} of ${formatCount(state.progress.total, language)}${state.progress.partial ? ' (partial data)' : ''}`
                : 'Reading element properties'}
            </span>
            <button type="button" className="bsh-button" onClick={state.cancel}>
              Cancel
            </button>
          </div>
        ) : null}
        {resolved && state.status === 'ready' && state.pending ? (
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
        {state.status === 'error' && (
          <StateBlock
            variant="error"
            compact
            message="We could not read this model's properties. Try again."
            detail={state.message}
            action={{ label: 'Retry', onClick: state.refresh }}
          />
        )}
        {state.status === 'cancelled' ? (
          <div className="bsh-summary__partial" role="status">
            <span>Partial data: the read was cancelled.</span>
            <button
              type="button"
              className="bsh-button"
              onClick={state.refresh}
            >
              Read again
            </button>
          </div>
        ) : null}
        {usable ? (
          <>
            <UnavailableModels models={state.models.unavailable} />
            <FailedModels
              names={state.failed}
              unavailable={state.models.unavailable}
            />
          </>
        ) : null}
        {emptyScope && (
          <StateBlock
            variant="empty"
            compact
            title={`No ${scopeName(state.elements).toLowerCase()} elements`}
            message="Change the element scope, or pick elements in the viewer."
          />
        )}
        {emptyBoard && activePreset && (
          <StateBlock
            variant="empty"
            compact
            title="Nothing to chart here"
            message={`This model has none of the properties ${activePreset.label} uses.`}
          />
        )}
        {kpiTiles.length > 0 ? (
          <HealthKpis tiles={kpiTiles} onSelect={pickKpi} />
        ) : null}
        {showGallery && !isCollapsed ? (
          <div id={`${uid}-gallery`}>
            <DashboardGallery
              view={view}
              rows={hasRows ? state.rows : undefined}
              apply={(next) => {
                setView(next);
                setGalleryOpen(false);
              }}
            />
          </div>
        ) : null}
        {activePreset && board.length > 0 && (
          <div className="bsh-boards">
            {board.map((item) => (
              <ChartBlock
                key={item.property}
                chart={item}
                type={
                  chartType === 'table'
                    ? 'table'
                    : legacyPair
                      ? 'bar'
                      : chartType
                }
                exportName={exportName}
                highlight={highlightFor(item)}
                pngTitle={view.pngTitle}
                pngLegend={view.pngLegend}
                onSelectLabel={crossFilter(item)}
                onColorModel={colorModel(item)}
              />
            ))}
          </div>
        )}
        {!activePreset && chart && options.length > 0 && (
          <>
            {selected !== view.property &&
            propertyNames.includes(view.property) ? (
              <p className="bsh-muted">
                This model has no {view.property} values, so the chart groups by{' '}
                {selected}.
              </p>
            ) : null}
            {chart.mixed ? (
              <StateBlock
                variant="empty"
                compact
                title="Mixed units"
                message={`These values carry different units (${(chart.units ?? []).join(', ')}), so they are not summed.`}
              />
            ) : chart.unavailable ? (
              <StateBlock
                variant="empty"
                compact
                title={
                  spec.measure
                    ? 'No numeric values'
                    : 'Choose a numeric property'
                }
                message={
                  spec.measure
                    ? `The ${AGGREGATE_LABELS[spec.aggregate].toLowerCase()} needs numbers in ${spec.measure}.`
                    : 'Pick a property to aggregate in Dashboard settings.'
                }
              />
            ) : (
              <>
                <div
                  className="bsh-charts"
                  data-single={
                    chartType !== 'table' && legacyPair ? undefined : true
                  }
                  data-table={chartType === 'table' || undefined}
                >
                  {chartType === 'table' ? (
                    <ChartTable
                      chart={chart}
                      label={chartLabel(chart, 'table')}
                      highlight={highlightFor(chart)}
                      onSelectLabel={crossFilter(chart)}
                      onColorModel={colorModel(chart)}
                    />
                  ) : legacyPair ? (
                    <>
                      <ChartBlock
                        chart={chart}
                        type="bar"
                        exportName={exportName}
                        highlight={highlightFor(chart)}
                        pngTitle={view.pngTitle}
                        pngLegend={view.pngLegend}
                        onSelectLabel={crossFilter(chart)}
                        onColorModel={colorModel(chart)}
                      />
                      <ChartBlock
                        chart={chart}
                        type="doughnut"
                        exportName={exportName}
                        highlight={highlightFor(chart)}
                        pngTitle={view.pngTitle}
                        pngLegend={view.pngLegend}
                        onSelectLabel={crossFilter(chart)}
                        onColorModel={colorModel(chart)}
                      />
                    </>
                  ) : (
                    <ChartBlock
                      chart={chart}
                      type={chartType}
                      exportName={exportName}
                      highlight={highlightFor(chart)}
                      pngTitle={view.pngTitle}
                      pngLegend={view.pngLegend}
                      onSelectLabel={crossFilter(chart)}
                      onColorModel={colorModel(chart)}
                    />
                  )}
                </div>
                {chartType !== 'table' ? (
                  <details
                    className="bsh-details"
                    open={chartSettings.dataTable}
                  >
                    <summary>Data table</summary>
                    <table className="bsh-table">
                      <caption className="bsh-sr-only">
                        {chart.measure
                          ? `${AGGREGATE_LABELS[chart.aggregate ?? 'count']} of ${chart.measure} by ${chart.property}`
                          : `Element counts by ${chart.property}`}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">{chart.property}</th>
                          {chart.aggregate && chart.aggregate !== 'count' ? (
                            <th scope="col" className="bsh-num">
                              {AGGREGATE_LABELS[chart.aggregate]}
                              {chart.unit ? ` (${chart.unit})` : ''}
                            </th>
                          ) : null}
                          {chart.series?.map((series) => (
                            <th
                              key={series.modelId}
                              scope="col"
                              className="bsh-num"
                            >
                              {series.label}
                            </th>
                          ))}
                          <th scope="col" className="bsh-num">
                            Count
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {chart.data.map((d, index) => (
                          <tr key={d.label}>
                            <td>{d.label}</td>
                            {chart.aggregate && chart.aggregate !== 'count' ? (
                              <td className="bsh-num">
                                {d.value === undefined
                                  ? '—'
                                  : d.value.toLocaleString(localeOf(language), {
                                      maximumFractionDigits: 2,
                                    })}
                              </td>
                            ) : null}
                            {chart.series?.map((series) => (
                              <td key={series.modelId} className="bsh-num">
                                {series.counts[index] ?? 0}
                              </td>
                            ))}
                            <td className="bsh-num">{d.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                ) : null}
              </>
            )}
          </>
        )}
        {settled && options.length === 0 && !emptyScope && (
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

interface ChartBlockProps {
  chart: ChartData;
  type: ChartType;
  exportName: string;
  highlight?: ReadonlySet<string>;
  pngTitle: boolean;
  pngLegend: boolean;
  onSelectLabel: (label: string) => void;
  onColorModel?: (colors: readonly string[]) => void;
}

function ChartBlock({
  chart,
  type,
  exportName,
  highlight,
  pngTitle,
  pngLegend,
  onSelectLabel,
  onColorModel,
}: ChartBlockProps) {
  if (type === 'table') {
    return (
      <ChartTable
        chart={chart}
        label={chartLabel(chart, 'table')}
        highlight={highlight}
        onSelectLabel={onSelectLabel}
        onColorModel={onColorModel}
      />
    );
  }
  return (
    <ChartCanvas
      kind={CANVAS_KIND[type]}
      chart={chart}
      label={chartLabel(chart, type)}
      exportName={exportName}
      highlight={highlight}
      pngTitle={pngTitle}
      pngLegend={pngLegend}
      onSelectLabel={onSelectLabel}
      onColorModel={onColorModel}
    />
  );
}
