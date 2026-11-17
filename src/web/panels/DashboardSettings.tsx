import { NumberField } from '../components/NumberField.js';
import { DEFAULT_DASHBOARD_PROPERTIES } from '../extensions/dashboardData.js';
import {
  CHART_KINDS,
  DASHBOARD_PRESETS,
  type DashboardKind,
  type DashboardView,
  DEFAULT_DASHBOARD_VIEW,
  KIND_LABELS,
  MAX_CATEGORIES,
  MIN_CATEGORIES,
  sanitizeDashboardView,
} from '../extensions/dashboardPresets.js';
import {
  ACTION_LABELS,
  ELEMENT_ACTIONS,
  type ElementAction,
  sanitizeAction,
} from '../extensions/elementActions.js';
import type { ModalDefinition } from '../modal/types.js';
import { BSH_KEYS } from '../storage.js';
import { usePersistedState } from './usePersistedState.js';

export const DASHBOARD_SETTINGS_ID = 'dashboard-settings';

export function useDashboardView() {
  return usePersistedState<DashboardView>(
    BSH_KEYS.personal.dashboardView,
    DEFAULT_DASHBOARD_VIEW,
    sanitizeDashboardView,
  );
}

export function DashboardSettingsBody() {
  const [view, setView, resetView] = useDashboardView();
  const [action, setAction, resetAction] = usePersistedState<ElementAction>(
    BSH_KEYS.personal.dashboardAction,
    'select',
    sanitizeAction,
  );
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
      <label className="bsh-field">
        Group by
        <select
          className="bsh-select"
          value={view.property}
          disabled={view.preset !== null}
          onChange={(e) => patch({ property: e.target.value })}
        >
          {DEFAULT_DASHBOARD_PROPERTIES.map((name) => (
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
      <button
        type="button"
        className="bsh-button"
        onClick={() => {
          resetView();
          resetAction();
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
