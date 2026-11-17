import {
  ACTION_LABELS,
  ELEMENT_ACTIONS,
  type ElementAction,
  sanitizeAction,
} from '../extensions/elementActions.js';
import {
  DEFAULT_SUMMARY_VIEW,
  SUMMARY_COLUMNS,
  type SummaryColumn,
  type SummaryView,
  sanitizeView,
} from '../extensions/modelSummary.js';
import type { ModalDefinition } from '../modal/types.js';
import { BSH_KEYS } from '../storage.js';
import { usePersistedState } from './usePersistedState.js';

export const SUMMARY_SETTINGS_ID = 'summary-settings';

export function SummarySettingsBody() {
  const [view, setView, resetView] = usePersistedState<SummaryView>(
    BSH_KEYS.personal.summaryView,
    DEFAULT_SUMMARY_VIEW,
    sanitizeView,
  );
  const [action, setAction] = usePersistedState<ElementAction>(
    BSH_KEYS.personal.summaryAction,
    'select',
    sanitizeAction,
  );
  const patch = (next: Partial<SummaryView>) =>
    setView((prev) => ({ ...prev, ...next }));
  const toggleColumn = (column: SummaryColumn) =>
    patch({
      hiddenColumns: view.hiddenColumns.includes(column)
        ? view.hiddenColumns.filter((c) => c !== column)
        : [...view.hiddenColumns, column],
    });

  return (
    <div className="bsh-summary-settings">
      <label className="bsh-field">
        <input
          type="checkbox"
          checked={view.hideEmpty}
          onChange={(e) => patch({ hideEmpty: e.target.checked })}
        />
        Hide (empty)
      </label>
      <label className="bsh-field">
        Minimum count
        <input
          type="number"
          min={1}
          className="bsh-input bsh-input--narrow"
          value={view.minCount}
          onChange={(e) =>
            patch({ minCount: Math.max(1, Math.floor(+e.target.value || 1)) })
          }
        />
      </label>
      <label className="bsh-field">
        Sort by
        <select
          className="bsh-select"
          value={view.sort}
          onChange={(e) =>
            patch({ sort: e.target.value === 'value' ? 'value' : 'count' })
          }
        >
          <option value="count">Count</option>
          <option value="value">Value</option>
        </select>
      </label>
      <label className="bsh-field">
        Density
        <select
          className="bsh-select"
          value={view.density}
          onChange={(e) =>
            patch({
              density: e.target.value === 'compact' ? 'compact' : 'comfortable',
            })
          }
        >
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </select>
      </label>
      <label className="bsh-field">
        Row click
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
      <fieldset className="bsh-fieldset">
        <legend>Columns</legend>
        {SUMMARY_COLUMNS.map((column) => (
          <label key={column} className="bsh-field">
            <input
              type="checkbox"
              checked={!view.hiddenColumns.includes(column)}
              onChange={() => toggleColumn(column)}
            />
            {column}
          </label>
        ))}
      </fieldset>
      <button type="button" className="bsh-button" onClick={resetView}>
        Reset view
      </button>
    </div>
  );
}

export const SUMMARY_SETTINGS_MODAL: ModalDefinition = {
  id: SUMMARY_SETTINGS_ID,
  title: 'Summary settings',
  size: 'lg',
  placement: 'top',
  Body: SummarySettingsBody,
};
