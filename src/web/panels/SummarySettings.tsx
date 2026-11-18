import { NumberField } from '../components/NumberField.js';
import {
  ACTION_LABELS,
  ELEMENT_ACTIONS,
  sanitizeAction,
} from '../extensions/elementActions.js';
import {
  SUMMARY_COLUMNS,
  type SummaryColumn,
  type SummaryView,
} from '../extensions/modelSummary.js';
import type { ModalDefinition } from '../modal/types.js';
import { PANE_SETTINGS, usePaneSetting } from '../settings/paneSettings.js';
import { usePublishedAdapter } from '../viewer/activeAdapterStore.js';
import { PropertyPicker } from './PropertyPicker.js';
import { useResolvedAdapter } from './usePropertyRows.js';

export const SUMMARY_SETTINGS_ID = 'summary-settings';

export function SummarySettingsBody() {
  const [view, setView, resetView] = usePaneSetting(PANE_SETTINGS.summary.view);
  const [properties, setProperties] = usePaneSetting(
    PANE_SETTINGS.summary.properties,
  );
  const adapter = useResolvedAdapter(usePublishedAdapter());
  const [action, setAction] = usePaneSetting(PANE_SETTINGS.summary.action);
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
      <fieldset className="bsh-fieldset">
        <legend>Properties</legend>
        <PropertyPicker
          adapter={adapter}
          value={properties}
          onChange={setProperties}
        />
      </fieldset>
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
        <NumberField
          min={1}
          className="bsh-input bsh-input--narrow"
          value={view.minCount}
          onCommit={(minCount) => patch({ minCount })}
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
  Body: SummarySettingsBody,
};
