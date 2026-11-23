import { NumberField } from '../components/NumberField.js';
import {
  AGGREGATE_LABELS,
  AGGREGATES,
  type Aggregate,
  CHART_TYPE_LABELS,
  CHART_TYPES,
  type ChartType,
  TOP_N_MAX,
  TOP_N_MIN,
} from '../extensions/dashboardData.js';
import {
  type DashboardView,
  kindForChartType,
  MAX_CATEGORIES,
  MIN_CATEGORIES,
  viewSpec,
} from '../extensions/dashboardPresets.js';
import {
  ACTION_LABELS,
  ELEMENT_ACTIONS,
  type ElementAction,
  sanitizeAction,
} from '../extensions/elementActions.js';
import {
  type HealthKpiOptions,
  MAX_KPI_THRESHOLD,
} from '../extensions/healthKpis.js';
import {
  setDashboardSettingsTarget,
  useDashboardSettingsTarget,
} from '../layout/dashboardTarget.js';
import { chartSetting } from '../layout/instanceSettings.js';
import type { PanelId } from '../layout/paneRegistry.js';
import type { ModalDefinition } from '../modal/types.js';
import { PANE_SETTINGS } from '../settings/paneSettings.js';
import { usePersisted } from '../storage.js';
import { usePublishedAdapter } from '../viewer/activeAdapterStore.js';
import { useModels } from '../viewer/useModels.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { DashboardPresetMenu } from './DashboardPresetMenu.js';
import { DashboardUserPresets } from './DashboardUserPresets.js';
import { HEALTH_KPI_SETTINGS } from './HealthKpis.js';
import { PropertyPicker } from './PropertyPicker.js';
import { usePropertyCatalog } from './usePropertyCatalog.js';
import { useResolvedAdapter } from './useScopedRows.js';

export const DASHBOARD_SETTINGS_ID = 'dashboard-settings';

type ViewSetter = (
  next: DashboardView | ((prev: DashboardView) => DashboardView),
) => void;

export function useDashboardView() {
  return usePersisted(PANE_SETTINGS.dashboard.view);
}

interface DashboardFieldsProps {
  adapter: ViewerAdapter | null;
  view: DashboardView;
  setView: ViewSetter;
  resetView: () => void;
  action?: ElementAction;
  setAction?: (action: ElementAction) => void;
  resetAction?: () => void;
  health?: HealthKpiOptions;
  setHealth?: (health: HealthKpiOptions) => void;
  resetHealth?: () => void;
}

function splitNames(text: string): string[] {
  return [
    ...new Set(
      text
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name !== ''),
    ),
  ];
}

function PropertyListField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: readonly string[];
  onCommit: (names: readonly string[]) => void;
}) {
  const joined = value.join(', ');
  return (
    <label className="bsh-field">
      {label}
      <input
        key={joined}
        type="text"
        className="bsh-input"
        defaultValue={joined}
        onBlur={(e) => onCommit(splitNames(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}

function DashboardFields({
  adapter,
  view,
  setView,
  resetView,
  action,
  setAction,
  resetAction,
  health,
  setHealth,
  resetHealth,
}: DashboardFieldsProps) {
  const properties = view.properties;
  const spec = viewSpec(view);
  const catalog = usePropertyCatalog(adapter);
  const names = [
    ...new Set([
      ...catalog.catalog.map((info) => info.name),
      ...properties,
      spec.measure,
    ]),
  ].filter((name) => name !== '');
  const groupBy = properties.includes(view.property)
    ? view.property
    : (properties[0] ?? view.property);
  const readyModels = useModels(adapter).filter(
    (model) => model.status === 'ready',
  ).length;
  const canSplit = readyModels >= 2;
  const patch = (next: Partial<DashboardView>) =>
    setView((prev) => ({ ...prev, ...next }));
  const pickProperties = (next: readonly string[]) =>
    patch({
      properties: next,
      property: next.includes(view.property)
        ? view.property
        : (next[0] ?? view.property),
    });
  const setChartType = (chartType: ChartType) =>
    patch({ chartType, kind: kindForChartType(chartType) });
  const setAggregate = (aggregate: Aggregate) => patch({ aggregate });
  const numeric = spec.aggregate !== 'count';

  return (
    <div className="bsh-summary-settings">
      <fieldset className="bsh-fieldset">
        <legend>Preset</legend>
        <DashboardPresetMenu view={view} apply={setView} />
      </fieldset>
      <DashboardUserPresets view={view} apply={setView} />
      <fieldset className="bsh-fieldset">
        <legend>Chart properties</legend>
        <PropertyPicker
          adapter={adapter}
          value={properties}
          onChange={pickProperties}
        />
      </fieldset>
      <fieldset className="bsh-fieldset">
        <legend>Chart</legend>
        <label className="bsh-field">
          Group by
          <select
            className="bsh-select"
            value={groupBy}
            disabled={view.preset !== null}
            onChange={(e) => {
              const property = e.target.value;
              patch({
                property,
                properties: properties.includes(property)
                  ? properties
                  : [...properties, property],
              });
            }}
          >
            {names.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="bsh-field">
          Aggregation
          <select
            className="bsh-select"
            value={spec.aggregate}
            disabled={view.preset !== null}
            onChange={(e) => setAggregate(e.target.value as Aggregate)}
          >
            {AGGREGATES.map((aggregate) => (
              <option key={aggregate} value={aggregate}>
                {AGGREGATE_LABELS[aggregate]}
              </option>
            ))}
          </select>
        </label>
        {numeric ? (
          <label className="bsh-field">
            Measure
            <select
              className="bsh-select"
              value={names.includes(spec.measure) ? spec.measure : ''}
              disabled={view.preset !== null}
              onChange={(e) => {
                const measure = e.target.value;
                patch({
                  measure,
                  properties:
                    !measure || properties.includes(measure)
                      ? properties
                      : [...properties, measure],
                });
              }}
            >
              <option value="">Choose a property</option>
              {names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="bsh-field">
          Maximum categories
          <NumberField
            min={Math.max(MIN_CATEGORIES, TOP_N_MIN)}
            max={Math.min(MAX_CATEGORIES, TOP_N_MAX)}
            className="bsh-input bsh-input--narrow"
            value={spec.topN}
            onCommit={(topN) =>
              patch({
                topN,
                maxCategories: Math.min(topN, MAX_CATEGORIES),
              })
            }
          />
        </label>
        <label className="bsh-field">
          <input
            type="checkbox"
            checked={spec.otherBucket}
            onChange={(e) => patch({ otherBucket: e.target.checked })}
          />{' '}
          Fold values beyond the top into Other
        </label>
        <label className="bsh-field">
          Chart type
          <select
            className="bsh-select"
            value={spec.chartType}
            onChange={(e) => setChartType(e.target.value as ChartType)}
          >
            {CHART_TYPES.map((type) => (
              <option key={type} value={type}>
                {CHART_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <p className="settings__hint">
          Numeric aggregations read the trailing unit and convert within one
          unit family. Different families are reported, not summed.
        </p>
      </fieldset>
      {action !== undefined && setAction ? (
        <label className="bsh-field">
          Chart click
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
      <label className="bsh-field">
        <input
          type="checkbox"
          checked={view.splitByModel === true}
          disabled={!canSplit}
          onChange={(e) =>
            patch({ splitByModel: e.target.checked || undefined })
          }
        />{' '}
        Split by model
      </label>
      {canSplit ? null : (
        <p className="bsh-muted">
          Open a second model to split a chart by model.
        </p>
      )}
      <label className="bsh-field">
        <input
          type="checkbox"
          checked={view.pngTitle}
          onChange={(e) => patch({ pngTitle: e.target.checked })}
        />{' '}
        Include the title in exported PNGs
      </label>
      <label className="bsh-field">
        <input
          type="checkbox"
          checked={view.pngLegend}
          onChange={(e) => patch({ pngLegend: e.target.checked })}
        />{' '}
        Include the legend in exported PNGs
      </label>
      {health && setHealth ? (
        <fieldset className="bsh-fieldset">
          <legend>Model health</legend>
          <label className="bsh-field">
            <input
              type="checkbox"
              checked={health.enabled}
              onChange={(e) =>
                setHealth({ ...health, enabled: e.target.checked })
              }
            />{' '}
            Show model health tiles
          </label>
          <label className="bsh-field">
            Health threshold (%)
            <NumberField
              min={0}
              max={MAX_KPI_THRESHOLD}
              className="bsh-input bsh-input--narrow"
              value={health.threshold}
              onCommit={(threshold) => setHealth({ ...health, threshold })}
            />
          </label>
          <PropertyListField
            label="Must-have properties"
            value={health.mustHave}
            onCommit={(mustHave) => setHealth({ ...health, mustHave })}
          />
          <PropertyListField
            label="Unique properties"
            value={health.unique}
            onCommit={(unique) => setHealth({ ...health, unique })}
          />
          <label className="bsh-field">
            Numeric property
            <select
              className="bsh-select"
              value={names.includes(health.measure) ? health.measure : ''}
              onChange={(e) =>
                setHealth({ ...health, measure: e.target.value })
              }
            >
              <option value="">Not checked</option>
              {names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {resetHealth ? (
            <button type="button" className="bsh-button" onClick={resetHealth}>
              Reset health checks
            </button>
          ) : null}
        </fieldset>
      ) : null}
      <button
        type="button"
        className="bsh-button"
        onClick={() => {
          resetView();
          resetAction?.();
          resetHealth?.();
        }}
      >
        {resetAction ? 'Reset dashboard' : 'Reset chart'}
      </button>
    </div>
  );
}

function GlobalDashboardSettings({
  adapter,
}: {
  adapter: ViewerAdapter | null;
}) {
  const [view, setView, resetView] = useDashboardView();
  const [action, setAction, resetAction] = usePersisted(
    PANE_SETTINGS.dashboard.action,
  );
  const [health, setHealth, resetHealth] = usePersisted(HEALTH_KPI_SETTINGS);
  return (
    <DashboardFields
      adapter={adapter}
      view={view}
      setView={setView}
      resetView={resetView}
      action={action}
      setAction={setAction}
      resetAction={resetAction}
      health={health}
      setHealth={setHealth}
      resetHealth={resetHealth}
    />
  );
}

function InstanceDashboardSettings({
  target,
  adapter,
}: {
  target: PanelId;
  adapter: ViewerAdapter | null;
}) {
  const [view, setView, resetView] = usePersisted(chartSetting(target));
  return (
    <DashboardFields
      adapter={adapter}
      view={view}
      setView={setView}
      resetView={resetView}
    />
  );
}

export function DashboardSettingsBody() {
  const target = useDashboardSettingsTarget();
  const adapter = useResolvedAdapter(usePublishedAdapter());
  return target ? (
    <InstanceDashboardSettings target={target} adapter={adapter} />
  ) : (
    <GlobalDashboardSettings adapter={adapter} />
  );
}

export const DASHBOARD_SETTINGS_MODAL: ModalDefinition = {
  id: DASHBOARD_SETTINGS_ID,
  title: 'Dashboard settings',
  size: 'lg',
  Body: DashboardSettingsBody,
  onClose: () => setDashboardSettingsTarget(null),
};
