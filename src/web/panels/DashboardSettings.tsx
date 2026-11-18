import { NumberField } from '../components/NumberField.js';
import { DEFAULT_DASHBOARD_PROPERTIES } from '../extensions/dashboardData.js';
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
  sanitizeAction,
} from '../extensions/elementActions.js';
import type { ModalDefinition } from '../modal/types.js';
import { PANE_SETTINGS, usePaneSetting } from '../settings/paneSettings.js';
import { defineRecord } from '../storage.js';
import { usePublishedAdapter } from '../viewer/activeAdapterStore.js';
import { DashboardUserPresets } from './DashboardUserPresets.js';
import { PropertyPicker } from './PropertyPicker.js';
import { useResolvedAdapter } from './useScopedRows.js';

export const DASHBOARD_SETTINGS_ID = 'dashboard-settings';

export const DASHBOARD_PROPERTIES_KEY = 'bsh.pane.dashboard.properties.v1';

export function sanitizeDashboardProperties(raw: unknown): readonly string[] {
  const names = Array.isArray(raw)
    ? [
        ...new Set(
          raw.filter(
            (name): name is string =>
              typeof name === 'string' && name.trim() !== '',
          ),
        ),
      ]
    : [];
  return names.length > 0 ? names : DEFAULT_DASHBOARD_PROPERTIES;
}

export const DASHBOARD_PROPERTIES = defineRecord({
  key: DASHBOARD_PROPERTIES_KEY,
  initial: DEFAULT_DASHBOARD_PROPERTIES,
  sanitize: sanitizeDashboardProperties,
});

export function useDashboardView() {
  return usePaneSetting(PANE_SETTINGS.dashboard.view);
}

export function DashboardSettingsBody() {
  const [view, setView, resetView] = useDashboardView();
  const [action, setAction, resetAction] = usePaneSetting(
    PANE_SETTINGS.dashboard.action,
  );
  const [properties, setProperties, resetProperties] =
    usePaneSetting(DASHBOARD_PROPERTIES);
  const adapter = useResolvedAdapter(usePublishedAdapter());
  const groupBy = properties.includes(view.property)
    ? view.property
    : (properties[0] ?? view.property);
  const patch = (next: Partial<DashboardView>) =>
    setView((prev) => ({ ...prev, ...next }));

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
          onChange={setProperties}
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
          resetAction();
          resetProperties();
        }}
      >
        Reset dashboard
      </button>
    </div>
  );
}

export const DASHBOARD_SETTINGS_MODAL: ModalDefinition = {
  id: DASHBOARD_SETTINGS_ID,
  title: 'Dashboard settings',
  size: 'lg',
  Body: DashboardSettingsBody,
};
