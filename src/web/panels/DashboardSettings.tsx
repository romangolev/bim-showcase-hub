import { NumberField } from '../components/NumberField.js';
import {
  CHART_KINDS,
  DASHBOARD_PRESETS,
  type DashboardKind,
  type DashboardView,
  KIND_LABELS,
  MAX_CATEGORIES,
  MIN_CATEGORIES,
} from '../extensions/dashboardPresets.js';
import {
  ACTION_LABELS,
  ELEMENT_ACTIONS,
  type ElementAction,
  sanitizeAction,
} from '../extensions/elementActions.js';
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
import { DashboardUserPresets } from './DashboardUserPresets.js';
import { PropertyPicker } from './PropertyPicker.js';
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
}

function DashboardFields({
  adapter,
  view,
  setView,
  resetView,
  action,
  setAction,
  resetAction,
}: DashboardFieldsProps) {
  const properties = view.properties;
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

  return (
    <div className="bsh-summary-settings">
      <fieldset className="bsh-fieldset">
        <legend>Preset</legend>
        <div className="bsh-presets">
          <button
            type="button"
            className="bsh-button"
            aria-pressed={view.preset === null}
            onClick={() => patch({ preset: null })}
          >
            Single chart
          </button>
          {DASHBOARD_PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="bsh-button"
              aria-pressed={view.preset === item.id}
              onClick={() => patch({ preset: item.id })}
            >
              {item.label}
            </button>
          ))}
        </div>
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
      <label className="bsh-field">
        Group by
        <select
          className="bsh-select"
          value={groupBy}
          disabled={view.preset !== null}
          onChange={(e) => patch({ property: e.target.value })}
        >
          {properties.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="bsh-field">
        Maximum categories
        <NumberField
          min={MIN_CATEGORIES}
          max={MAX_CATEGORIES}
          className="bsh-input bsh-input--narrow"
          value={view.maxCategories}
          onCommit={(maxCategories) => patch({ maxCategories })}
        />
      </label>
      <label className="bsh-field">
        Chart type
        <select
          className="bsh-select"
          value={view.kind}
          onChange={(e) => patch({ kind: e.target.value as DashboardKind })}
        >
          {CHART_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </label>
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
      <button
        type="button"
        className="bsh-button"
        onClick={() => {
          resetView();
          resetAction?.();
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
  return (
    <DashboardFields
      adapter={adapter}
      view={view}
      setView={setView}
      resetView={resetView}
      action={action}
      setAction={setAction}
      resetAction={resetAction}
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
