import { useState } from 'react';
import { Icon } from '../components/icons.js';
import {
  type FormDefinition,
  SettingsForm,
} from '../components/SettingsForm.js';
import {
  ACTION_LABELS,
  ELEMENT_ACTIONS,
  type ElementAction,
  sanitizeAction,
} from '../extensions/elementActions.js';
import {
  DEFAULT_SUMMARY_VIEW,
  MAX_GROUP_BY,
  MAX_PRECISION,
  MAX_TITLE_LENGTH,
  MAX_UNIT_LABEL,
  SUMMARY_COLUMNS,
  SUMMARY_LAYOUTS,
  type SummaryColumn,
  type SummaryLayout,
  type SummaryView,
  sanitizeLayout,
} from '../extensions/modelSummary.js';
import { summarySetting } from '../layout/instanceSettings.js';
import type { PanelId } from '../layout/paneRegistry.js';
import {
  setSummarySettingsTarget,
  useSummarySettingsTarget,
} from '../layout/summaryTarget.js';
import type { ModalDefinition } from '../modal/types.js';
import { PANE_SETTINGS } from '../settings/paneSettings.js';
import { usePersisted } from '../storage.js';
import { usePublishedAdapter } from '../viewer/activeAdapterStore.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { PropertyPicker } from './PropertyPicker.js';
import { useResolvedAdapter } from './useScopedRows.js';

export const SUMMARY_SETTINGS_ID = 'summary-settings';

interface SummaryForm {
  layout: string;
  measure: string;
  unitLabel: string;
  precision: number;
  hideEmpty: boolean;
  minCount: number;
  sort: string;
  density: string;
  action: ElementAction;
  autoRefresh: boolean;
  columns: SummaryColumn[];
}

const LAYOUT_LABELS: Record<SummaryLayout, string> = {
  flat: 'Flat list',
  grouped: 'Grouped blocks',
  pivot: 'Pivot',
};

function summaryForm(
  propertyNames: readonly string[],
): FormDefinition<SummaryForm> {
  return {
    fields: [
      {
        key: 'layout',
        kind: 'select',
        label: 'Layout',
        options: SUMMARY_LAYOUTS.map((layout) => ({
          value: layout,
          label: LAYOUT_LABELS[layout],
        })),
      },
      {
        key: 'measure',
        kind: 'select',
        label: 'Measure',
        options: [
          { value: '', label: 'None' },
          ...propertyNames.map((name) => ({ value: name, label: name })),
        ],
        hint: 'Sums a numeric property per value, such as Area or Volume.',
      },
      {
        key: 'unitLabel',
        kind: 'text',
        label: 'Unit label',
        maxLength: MAX_UNIT_LABEL,
        hint: 'Shown after the sum. Empty keeps the unit read from the value.',
      },
      {
        key: 'precision',
        kind: 'number',
        label: 'Decimal places',
        min: 0,
        max: MAX_PRECISION,
      },
      { key: 'hideEmpty', kind: 'toggle', label: 'Hide (empty)' },
      { key: 'minCount', kind: 'number', label: 'Minimum count', min: 1 },
      {
        key: 'sort',
        kind: 'select',
        label: 'Sort by',
        options: [
          { value: 'count', label: 'Count' },
          { value: 'value', label: 'Value' },
        ],
      },
      {
        key: 'density',
        kind: 'select',
        label: 'Density',
        options: [
          { value: 'comfortable', label: 'Comfortable' },
          { value: 'compact', label: 'Compact' },
        ],
      },
      {
        key: 'action',
        kind: 'select',
        label: 'Row click',
        options: ELEMENT_ACTIONS.map((name) => ({
          value: name,
          label: ACTION_LABELS[name],
        })),
      },
      {
        key: 'autoRefresh',
        kind: 'toggle',
        label: 'Refresh when the model changes',
      },
      {
        key: 'columns',
        kind: 'multi',
        label: 'Columns',
        options: SUMMARY_COLUMNS.map((column) => ({
          value: column,
          label: column,
        })),
      },
    ],
  };
}

function GroupByEditor({
  propertyNames,
  value,
  onChange,
}: {
  propertyNames: readonly string[];
  value: readonly string[];
  onChange: (groupBy: string[]) => void;
}) {
  const [pending, setPending] = useState('');
  const available = propertyNames.filter((name) => !value.includes(name));
  const selected = available.includes(pending) ? pending : (available[0] ?? '');
  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    const [name] = next.splice(from, 1);
    if (!name) return;
    next.splice(to, 0, name);
    onChange(next);
  };
  return (
    <fieldset className="settings__section">
      <legend className="settings__heading">Group by, outermost first</legend>
      {value.length === 0 ? (
        <p className="settings__hint">
          A pivot needs at least one grouping property.
        </p>
      ) : (
        <ol className="settings__override-list">
          {value.map((name, index) => (
            <li key={name} className="settings__override">
              <span>{name}</span>
              <button
                type="button"
                className="inline-action"
                aria-label={`Move ${name} up`}
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              >
                <Icon name="arrowUp" size={14} />
              </button>
              <button
                type="button"
                className="inline-action"
                aria-label={`Move ${name} down`}
                disabled={index === value.length - 1}
                onClick={() => move(index, index + 1)}
              >
                <Icon name="arrowDown" size={14} />
              </button>
              <button
                type="button"
                className="btn btn-small"
                aria-label={`Remove ${name} from the grouping`}
                onClick={() => onChange(value.filter((item) => item !== name))}
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="settings__actions">
        <select
          aria-label="Add a grouping property"
          value={selected}
          disabled={available.length === 0 || value.length >= MAX_GROUP_BY}
          onChange={(event) => setPending(event.target.value)}
        >
          {available.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn"
          disabled={
            !selected || available.length === 0 || value.length >= MAX_GROUP_BY
          }
          onClick={() => {
            if (!selected) return;
            onChange([...value, selected]);
            setPending('');
          }}
        >
          Add level
        </button>
      </div>
    </fieldset>
  );
}

function TitleEditor({
  propertyNames,
  titles,
  onChange,
}: {
  propertyNames: readonly string[];
  titles: Record<string, string>;
  onChange: (titles: Record<string, string>) => void;
}) {
  if (propertyNames.length === 0) return null;
  const setTitle = (property: string, text: string) => {
    const next = { ...titles };
    if (text.trim()) next[property] = text;
    else delete next[property];
    onChange(next);
  };
  return (
    <fieldset className="settings__section">
      <legend className="settings__heading">Block titles</legend>
      {propertyNames.map((property) => (
        <label key={property} className="settings__field">
          {property}
          <input
            type="text"
            maxLength={MAX_TITLE_LENGTH}
            placeholder={property}
            value={titles[property] ?? ''}
            onChange={(event) => setTitle(property, event.target.value)}
          />
        </label>
      ))}
      {Object.keys(titles).length > 0 ? (
        <div className="settings__actions">
          <button type="button" className="btn" onClick={() => onChange({})}>
            Reset block titles
          </button>
        </div>
      ) : null}
    </fieldset>
  );
}

function SummaryFields({
  view,
  action,
  adapter,
  propertyNames,
  onProperties,
  onView,
  onAction,
  onReset,
}: {
  view: SummaryView;
  action: ElementAction;
  adapter: ViewerAdapter | null;
  propertyNames: readonly string[];
  onProperties: (names: readonly string[]) => void;
  onView: (view: SummaryView) => void;
  onAction: (action: ElementAction) => void;
  onReset: () => void;
}) {
  const value: SummaryForm = {
    layout: view.layout,
    measure: view.measure ?? '',
    unitLabel: view.unitLabel,
    precision: view.precision,
    hideEmpty: view.hideEmpty,
    minCount: view.minCount,
    sort: view.sort,
    density: view.density,
    action,
    autoRefresh: view.autoRefresh,
    columns: SUMMARY_COLUMNS.filter((c) => !view.hiddenColumns.includes(c)),
  };
  const onChange = (patch: Partial<SummaryForm>) => {
    const {
      action: nextAction,
      columns,
      sort,
      density,
      measure,
      layout,
      unitLabel,
      precision,
      ...rest
    } = patch;
    if (nextAction !== undefined) onAction(sanitizeAction(nextAction));
    const next: Partial<SummaryView> = { ...rest };
    if (sort !== undefined) next.sort = sort === 'value' ? 'value' : 'count';
    if (density !== undefined) {
      next.density = density === 'compact' ? 'compact' : 'comfortable';
    }
    if (layout !== undefined) next.layout = sanitizeLayout(layout);
    if (measure !== undefined) next.measure = measure.trim() || null;
    if (unitLabel !== undefined) next.unitLabel = unitLabel;
    if (precision !== undefined) {
      next.precision = Math.min(
        MAX_PRECISION,
        Math.max(0, Math.floor(Number(precision) || 0)),
      );
    }
    if (columns) {
      next.hiddenColumns = SUMMARY_COLUMNS.filter((c) => !columns.includes(c));
    }
    if (Object.keys(next).length) onView({ ...view, ...next });
  };
  const groupBy = view.groupBy.filter((name) => propertyNames.includes(name));
  return (
    <div className="settings">
      <fieldset className="settings__section">
        <legend className="settings__heading">Properties</legend>
        <PropertyPicker
          adapter={adapter}
          value={propertyNames}
          onChange={onProperties}
        />
      </fieldset>
      <SettingsForm
        form={summaryForm(propertyNames)}
        value={value}
        onChange={onChange}
      />
      {view.layout === 'pivot' ? (
        <GroupByEditor
          propertyNames={propertyNames}
          value={groupBy}
          onChange={(next) =>
            onView({ ...view, groupBy: next, layout: view.layout })
          }
        />
      ) : null}
      <TitleEditor
        propertyNames={propertyNames}
        titles={view.titles}
        onChange={(titles) => onView({ ...view, titles })}
      />
      <div className="settings__actions">
        <button type="button" className="btn" onClick={onReset}>
          Reset view
        </button>
      </div>
    </div>
  );
}

function GlobalSummarySettings({ adapter }: { adapter: ViewerAdapter | null }) {
  const [view, setView, resetView] = usePersisted(PANE_SETTINGS.summary.view);
  const [action, setAction, resetAction] = usePersisted(
    PANE_SETTINGS.summary.action,
  );
  const [properties, setProperties] = usePersisted(
    PANE_SETTINGS.summary.properties,
  );
  return (
    <SummaryFields
      view={view}
      action={action}
      adapter={adapter}
      propertyNames={properties}
      onProperties={setProperties}
      onView={setView}
      onAction={setAction}
      onReset={() => {
        resetView();
        resetAction();
      }}
    />
  );
}

function InstanceSummarySettings({
  target,
  adapter,
}: {
  target: PanelId;
  adapter: ViewerAdapter | null;
}) {
  const [spec, setSpec] = usePersisted(summarySetting(target));
  return (
    <SummaryFields
      view={spec.view}
      action={spec.action}
      adapter={adapter}
      propertyNames={spec.properties}
      onProperties={(properties) =>
        setSpec((prev) => ({ ...prev, properties }))
      }
      onView={(view) => setSpec((prev) => ({ ...prev, view }))}
      onAction={(action) => setSpec((prev) => ({ ...prev, action }))}
      onReset={() =>
        setSpec((prev) => ({
          ...prev,
          view: DEFAULT_SUMMARY_VIEW,
          action: 'select',
        }))
      }
    />
  );
}

export function SummarySettingsBody() {
  const target = useSummarySettingsTarget();
  const adapter = useResolvedAdapter(usePublishedAdapter());
  return target ? (
    <InstanceSummarySettings target={target} adapter={adapter} />
  ) : (
    <GlobalSummarySettings adapter={adapter} />
  );
}

export const SUMMARY_SETTINGS_MODAL: ModalDefinition = {
  id: SUMMARY_SETTINGS_ID,
  title: 'Summary settings',
  size: 'lg',
  Body: SummarySettingsBody,
  onClose: () => setSummarySettingsTarget(null),
};
