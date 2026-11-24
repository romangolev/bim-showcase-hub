import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Icon } from '../components/icons.js';
import {
  type PaneAction,
  PaneActionsMenu,
} from '../components/PaneActionsMenu.js';
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
  withControls,
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
import { DashboardPresetMenu } from './DashboardPresetMenu.js';
import { ChartTile } from './DashboardTile.js';
import { HEALTH_KPI_SETTINGS, HealthKpis } from './HealthKpis.js';
import {
  FailedModels,
  ModelScopeSelect,
  UnavailableModels,
} from './ModelScope.js';
import { ScopedRowsStatus } from './ScopedRowsStatus.js';
import { useAutoCompact } from './useAutoCompact.js';
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
  const emptyBoard = hasRows && chartSpecs.length > 0 && shown.length === 0;
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

  const sectionRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const controlsToggleRef = useRef<HTMLButtonElement>(null);
  const autoCompact = useAutoCompact(sectionRef);
  const compact =
    !isCollapsed &&
    (view.controls === undefined ? autoCompact : !view.controls);
  const toggleControls = () =>
    setView((prev) =>
      withControls(prev, compact === autoCompact ? compact : undefined),
    );
  const focusInHeader =
    headerRef.current?.contains(document.activeElement) ?? false;
  useLayoutEffect(() => {
    if (
      compact &&
      focusInHeader &&
      !headerRef.current?.contains(document.activeElement)
    ) {
      controlsToggleRef.current?.focus();
    }
  }, [compact, focusInHeader]);
  const showControls = !isCollapsed && !compact;
  const orientations: DashboardOrientation[] = ['vertical', 'horizontal'];
  const actions = (): PaneAction[] => [
    {
      id: 'add',
      label: 'Add chart',
      disabled: chartSpecs.length >= MAX_CHARTS,
      onSelect: () => setView(addChart),
    },
    {
      id: 'refresh',
      label: 'Refresh',
      disabled: !resolved,
      onSelect: state.refresh,
    },
    ...(chartSpecs.length > 1
      ? [
          { kind: 'separator' as const, id: 'layout-sep' },
          ...orientations.map((orientation) => ({
            id: orientation,
            label: `${ORIENTATION_LABELS[orientation]} layout`,
            checked: view.orientation === orientation,
            onSelect: () => setView((prev) => ({ ...prev, orientation })),
          })),
        ]
      : []),
    { kind: 'separator' as const, id: 'model-sep' },
    {
      id: 'colour',
      label: 'Colour the model by this chart',
      checked: primaryColored,
      disabled: !resolved || !primary,
      onSelect: colorByPrimary,
    },
    ...(onOpenSettings
      ? [
          {
            id: 'settings',
            label: 'Dashboard settings',
            onSelect: onOpenSettings,
          },
        ]
      : []),
  ];

  const bodyId = `${uid}-body`;

  return (
    <section
      ref={sectionRef}
      className={`bsh-card bsh-drawer ${className ?? ''}`.trim()}
      aria-labelledby={`${uid}-title`}
      data-collapsed={isCollapsed}
      data-compact={compact}
    >
      <header ref={headerRef} className="bsh-card__header bsh-drawer__header">
        <h2 id={`${uid}-title`} className="bsh-card__title">
          {title}
        </h2>
        {toggleable ? (
          <button
            type="button"
            className="btn bsh-drawer__toggle"
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
        {showControls ? (
          <ModelScopeSelect state={state.models} label="Chart models" />
        ) : null}
        {showControls && chartSpecs.length > 1 ? (
          <fieldset className="bsh-kinds" aria-label="Chart layout">
            {orientations.map((orientation) => (
              <button
                key={orientation}
                type="button"
                className="btn"
                aria-pressed={view.orientation === orientation}
                onClick={() => setView((prev) => ({ ...prev, orientation }))}
              >
                {ORIENTATION_LABELS[orientation]}
              </button>
            ))}
          </fieldset>
        ) : null}
        {showControls ? (
          <button
            type="button"
            className="btn"
            disabled={chartSpecs.length >= MAX_CHARTS}
            onClick={() => setView(addChart)}
          >
            Add chart
          </button>
        ) : null}
        {showControls && resolved ? (
          <DashboardPresetMenu
            view={view}
            apply={(next) =>
              setView((prev) => withControls(next, prev.controls))
            }
          />
        ) : null}
        {compact ? (
          <PaneActionsMenu label="Dashboard actions" actions={actions} />
        ) : null}
        {compact ? null : (
          <>
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
          </>
        )}
        {onOpenSettings && !compact ? (
          <button
            type="button"
            className="icon-button"
            onClick={onOpenSettings}
          >
            <Icon name="settings" size={16} />
            <span className="bsh-sr-only">Dashboard settings</span>
          </button>
        ) : null}
        {isCollapsed ? null : (
          <button
            ref={controlsToggleRef}
            type="button"
            className="icon-button bsh-drawer__controls"
            aria-label="Dashboard controls"
            aria-expanded={!compact}
            title={compact ? 'Show controls' : 'Hide controls'}
            onClick={toggleControls}
          >
            <Icon name="sliders" size={16} />
          </button>
        )}
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
        {settled && chartSpecs.length === 0 && (
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
