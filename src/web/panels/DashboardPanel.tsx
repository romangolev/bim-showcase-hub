import { useEffect, useId, useMemo, useState } from 'react';
import { Icon } from '../components/icons.js';
import { StateBlock } from '../components/StateBlock.js';
import { colorByChart } from '../extensions/colorBy.js';
import {
  availableProperties,
  bucketLabels,
  buildChart,
  type ChartData,
  readChartTheme,
  selectedBuckets,
  seriesColors,
} from '../extensions/dashboardData.js';
import {
  addChart,
  chartTitle,
  type DashboardOrientation,
  type DashboardView,
  MAX_CHARTS,
  ORIENTATION_LABELS,
  patchChart,
  removeChart,
  viewSpec,
} from '../extensions/dashboardPresets.js';
import {
  itemsWithValues,
  runElementAction,
} from '../extensions/elementActions.js';
import { type HealthKpiTile, healthKpis } from '../extensions/healthKpis.js';
import { PANE_SETTINGS } from '../settings/paneSettings.js';
import { useSettings } from '../settings/SettingsContext.js';
import { type PersistedRecord, usePersisted } from '../storage.js';
import { notify } from '../tasks/notifications.js';
import {
  applyColoring,
  clearColoring,
  useModelColoring,
} from '../viewer/modelColoring.js';
import { ALL_MODELS } from '../viewer/modelScope.js';
import { splitByModel } from '../viewer/modelSeries.js';
import type { ModelDbId } from '../viewer/modelSet.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { ChartBoard } from './ChartBoard.js';
import { CHART_SETTINGS } from './chartSettings.js';
import { DashboardGallery } from './DashboardGallery.js';
import { DashboardPresetMenu } from './DashboardPresetMenu.js';
import { ChartTile } from './DashboardTile.js';
import { ElementScopeSelect, scopeName } from './ElementScope.js';
import { HEALTH_KPI_SETTINGS, HealthKpis } from './HealthKpis.js';
import {
  FailedModels,
  ModelScopeSelect,
  UnavailableModels,
} from './ModelScope.js';
import { ScopedRowsStatus } from './ScopedRowsStatus.js';
import {
  SELECTION_DEBOUNCE_MS,
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
  const chartSpecs = view.charts;
  const readNames = useMemo(() => {
    const names = new Set(view.properties);
    for (const item of chartSpecs) names.add(item.property);
    if (spec.aggregate !== 'count' && spec.measure) names.add(spec.measure);
    if (!setting) {
      for (const name of health.mustHave) names.add(name);
      for (const name of health.unique) names.add(name);
      if (health.measure) names.add(health.measure);
    }
    return [...names];
  }, [
    view.properties,
    chartSpecs,
    spec.aggregate,
    spec.measure,
    setting,
    health,
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

  const menuProperties = useMemo(
    () =>
      state.rows.length > 0
        ? availableProperties(state.rows, view.properties)
        : view.properties,
    [state.rows, view.properties],
  );

  const built = useMemo(
    () =>
      chartSpecs.map((item) => {
        if (
          !usable ||
          availableProperties(state.rows, [item.property]).length === 0
        ) {
          return null;
        }
        const shaped = buildChart(state.rows, {
          property: item.property,
          aggregate: spec.aggregate,
          measure: spec.measure,
          topN: spec.topN,
          otherBucket: spec.otherBucket,
        });
        return view.splitByModel ? splitByModel(shaped, state.rows) : shaped;
      }),
    [
      usable,
      state.rows,
      chartSpecs,
      spec.aggregate,
      spec.measure,
      spec.topN,
      spec.otherBucket,
      view.splitByModel,
    ],
  );
  const shown = useMemo(
    () => built.filter((item): item is ChartData => item !== null),
    [built],
  );

  const [action] = usePersisted(PANE_SETTINGS.dashboard.action);
  const settled = usable && !state.pending;
  const hasRows = settled && state.rows.length > 0;
  const emptyScope =
    settled && state.rows.length === 0 && state.elements !== 'all';
  const emptyBoard = hasRows && chartSpecs.length > 0 && shown.length === 0;
  const showGallery = galleryOpen || !resolved || emptyBoard;
  const [viewerSelection, setViewerSelection] = useState<ModelDbId[]>([]);
  useEffect(() => {
    if (!resolved) {
      setViewerSelection([]);
      return;
    }
    setViewerSelection(resolved.getModelSelection());
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = resolved.onSelectionChange((list) => {
      clearTimeout(timer);
      timer = setTimeout(() => setViewerSelection(list), SELECTION_DEBOUNCE_MS);
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [resolved]);
  const highlights = useMemo(
    () =>
      new Map(
        shown.map((item) => [
          item,
          selectedBuckets(state.rows, item, viewerSelection),
        ]),
      ),
    [shown, state.rows, viewerSelection],
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
  const primary = shown[0] ?? null;
  const activeColoring = useModelColoring(resolved);
  const primaryTitle = primary
    ? primary.measure
      ? `${primary.property} (${primary.measure})`
      : primary.property
    : null;
  const primaryColored =
    activeColoring?.origin === 'chart' && activeColoring.title === primaryTitle;
  const colorByPrimary = () => {
    if (!resolved || !primary) return;
    if (primaryColored) {
      clearColoring(resolved);
      return;
    }
    colorModel(primary)(
      seriesColors(
        readChartTheme(),
        primary.data.map((d) => d.label),
        chartSettings.palette,
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
            className="btn"
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
        {!isCollapsed && chartSpecs.length > 1 ? (
          <fieldset className="bsh-kinds" aria-label="Chart layout">
            {(['vertical', 'horizontal'] as DashboardOrientation[]).map(
              (orientation) => (
                <button
                  key={orientation}
                  type="button"
                  className="btn"
                  aria-pressed={view.orientation === orientation}
                  onClick={() => setView((prev) => ({ ...prev, orientation }))}
                >
                  {ORIENTATION_LABELS[orientation]}
                </button>
              ),
            )}
          </fieldset>
        ) : null}
        {!isCollapsed ? (
          <button
            type="button"
            className="btn"
            disabled={chartSpecs.length >= MAX_CHARTS}
            onClick={() => setView(addChart)}
          >
            Add chart
          </button>
        ) : null}
        {!isCollapsed && resolved && !emptyBoard ? (
          <DashboardPresetMenu
            view={view}
            apply={setView}
            onBrowse={() => setGalleryOpen((open) => !open)}
            browsing={galleryOpen}
          />
        ) : null}
        <button
          type="button"
          className="icon-button"
          aria-label="Colour the model by this chart"
          aria-pressed={primaryColored}
          title={
            !resolved
              ? 'Open a model to colour it'
              : !primary
                ? 'No chart data to colour by'
                : primaryColored
                  ? 'Clear the chart colouring'
                  : 'Colour the model by this chart'
          }
          onClick={colorByPrimary}
          disabled={!resolved || !primary}
        >
          <Icon name="palette" size={16} />
        </button>
        <button
          type="button"
          className="btn"
          onClick={state.refresh}
          disabled={!resolved}
        >
          Refresh
        </button>
        {onOpenSettings ? (
          <button
            type="button"
            className="icon-button"
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
        <ScopedRowsStatus state={state} resolved={resolved} />
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
        {emptyBoard && (
          <StateBlock
            variant="empty"
            compact
            title="Nothing to chart here"
            message="This model has none of the properties these charts group by."
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
        {chartSpecs.length > 0 && usable && !emptyBoard ? (
          <ChartBoard
            orientation={view.orientation}
            sizes={view.sizes}
            onSizes={(sizes) => setView((prev) => ({ ...prev, sizes }))}
            labels={chartSpecs.map(chartTitle)}
          >
            {chartSpecs.map((item, index) => {
              const data = built[index] ?? null;
              return (
                <ChartTile
                  key={item.id}
                  spec={item}
                  chart={data}
                  properties={menuProperties}
                  language={language}
                  exportName={exportName}
                  highlight={data ? highlightFor(data) : undefined}
                  pngTitle={view.pngTitle}
                  pngLegend={view.pngLegend}
                  tableOpen={chartSettings.dataTable}
                  onChange={(patch) =>
                    setView((prev) => patchChart(prev, item.id, patch))
                  }
                  onRemove={() => setView((prev) => removeChart(prev, item.id))}
                  onSelectLabel={data ? crossFilter(data) : () => undefined}
                  onColorModel={data ? colorModel(data) : () => undefined}
                />
              );
            })}
          </ChartBoard>
        ) : null}
        {settled && chartSpecs.length === 0 && !emptyScope && (
          <StateBlock
            variant="empty"
            compact
            title="No charts"
            message="Add a chart to group elements by a property."
          />
        )}
      </div>
    </section>
  );
}
