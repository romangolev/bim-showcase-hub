import { type ReactNode, useState } from 'react';
import { ItemList, ItemRow } from '../components/ItemList.js';
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
  applyAddition,
  COUNT_COLUMN,
  columnTitle,
  DEFAULT_SUMMARY_VIEW,
  MAX_GROUP_BY,
  MAX_SUMMARY_COLUMNS,
  MAX_SUMMARY_ROWS,
  MAX_TITLE_LENGTH,
  SUMMARY_AGGREGATE_LABELS,
  SUMMARY_LAYOUTS,
  type SummaryAddition,
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
import { announce } from '../tasks/notifications.js';
import { usePublishedAdapter } from '../viewer/activeAdapterStore.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { promptSummaryProperty } from './SummaryPropertyDialog.js';
import { useResolvedAdapter } from './useScopedRows.js';

export const SUMMARY_SETTINGS_ID = 'summary-settings';

interface SummaryForm {
  layout: string;
  showProperty: boolean;
  hideEmpty: boolean;
  minCount: number;
  sort: string;
  density: string;
  action: ElementAction;
  autoRefresh: boolean;
}

const LAYOUT_LABELS: Record<SummaryLayout, string> = {
  flat: 'Flat list',
  grouped: 'Grouped blocks',
  pivot: 'Pivot',
};

const SUMMARY_FORM: FormDefinition<SummaryForm> = {
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
      key: 'showProperty',
      kind: 'toggle',
      label: 'Show the property column',
      hint: 'Flat layout only. The value column always shows.',
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
  ],
};

interface OrderedEditorProps<T> {
  heading: string;
  hint?: string;
  items: readonly T[];
  keyOf: (item: T) => string;
  titleOf: (item: T) => string;
  detailOf?: (item: T) => string;
  minimum?: number;
  canEdit?: (item: T) => boolean;
  onChange: (items: T[]) => void;
  onEdit: (item: T) => void;
  onAdd: () => void;
  addLabel: string;
  addDisabled: boolean;
  children?: ReactNode;
}

function OrderedEditor<T>({
  heading,
  hint,
  items,
  keyOf,
  titleOf,
  detailOf,
  minimum = 0,
  canEdit = () => true,
  onChange,
  onEdit,
  onAdd,
  addLabel,
  addDisabled,
  children,
}: OrderedEditorProps<T>) {
  const move = (from: number, to: number) => {
    const item = items[from];
    if (item === undefined || to < 0 || to >= items.length) return;
    const next = [...items];
    next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
    announce(`Moved ${titleOf(item)} to position ${to + 1} of ${items.length}`);
  };
  return (
    <fieldset className="settings__section">
      <legend className="settings__heading">{heading}</legend>
      {items.length === 0 ? (
        hint ? (
          <p className="settings__hint">{hint}</p>
        ) : null
      ) : (
        <ItemList ordered>
          {items.map((item, index) => {
            const title = titleOf(item);
            return (
              <ItemRow key={keyOf(item)}>
                <span>
                  {title}
                  {detailOf ? (
                    <span className="settings__hint"> ({detailOf(item)})</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  className="inline-action"
                  aria-label={`Move ${title} up`}
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  <Icon name="arrowUp" size={14} />
                </button>
                <button
                  type="button"
                  className="inline-action"
                  aria-label={`Move ${title} down`}
                  disabled={index === items.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  <Icon name="arrowDown" size={14} />
                </button>
                {canEdit(item) ? (
                  <button
                    type="button"
                    className="btn btn-small"
                    aria-label={`Edit ${title}`}
                    onClick={() => onEdit(item)}
                  >
                    Edit...
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-small"
                  aria-label={`Remove ${title}`}
                  disabled={items.length <= minimum}
                  onClick={() =>
                    onChange(items.filter((_, position) => position !== index))
                  }
                >
                  Remove
                </button>
              </ItemRow>
            );
          })}
        </ItemList>
      )}
      <div className="settings__actions">
        <button
          type="button"
          className="btn"
          aria-label={addLabel}
          disabled={addDisabled}
          onClick={onAdd}
        >
          Add...
        </button>
        {children}
      </div>
    </fieldset>
  );
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
      <legend className="settings__heading">
        Pivot levels, outermost first
      </legend>
      {value.length === 0 ? (
        <p className="settings__hint">
          Optional. Without levels the pivot nests the rows in order.
        </p>
      ) : (
        <ItemList ordered>
          {value.map((name, index) => (
            <ItemRow key={name}>
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
            </ItemRow>
          ))}
        </ItemList>
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
    showProperty: view.showProperty,
    hideEmpty: view.hideEmpty,
    minCount: view.minCount,
    sort: view.sort,
    density: view.density,
    action,
    autoRefresh: view.autoRefresh,
  };
  const onChange = (patch: Partial<SummaryForm>) => {
    const { action: nextAction, sort, density, layout, ...rest } = patch;
    if (nextAction !== undefined) onAction(sanitizeAction(nextAction));
    const next: Partial<SummaryView> = { ...rest };
    if (sort !== undefined) next.sort = sort === 'value' ? 'value' : 'count';
    if (density !== undefined) {
      next.density = density === 'compact' ? 'compact' : 'comfortable';
    }
    if (layout !== undefined) next.layout = sanitizeLayout(layout);
    if (Object.keys(next).length) onView({ ...view, ...next });
  };
  const open = (role: SummaryAddition['role'], editing?: SummaryAddition) =>
    promptSummaryProperty({
      adapter,
      rows: propertyNames,
      columns: view.columns,
      role,
      ...(editing ? { editing } : {}),
      onSubmit: (addition) => {
        const next = applyAddition(
          propertyNames,
          view.columns,
          addition,
          editing,
        );
        onProperties(next.properties);
        onView({ ...view, columns: next.columns });
      },
    });
  const columnsFull = view.columns.length >= MAX_SUMMARY_COLUMNS;
  const groupBy = view.groupBy.filter((name) => propertyNames.includes(name));
  return (
    <>
      <OrderedEditor
        heading="Rows"
        items={propertyNames}
        keyOf={(name) => name}
        titleOf={(name) => name}
        minimum={1}
        onChange={onProperties}
        onEdit={(property) => open('rows', { role: 'rows', property })}
        onAdd={() => open('rows')}
        addLabel="Add a row property"
        addDisabled={propertyNames.length >= MAX_SUMMARY_ROWS}
      />
      <OrderedEditor
        heading="Columns"
        hint="No columns: rows show their labels only."
        items={view.columns}
        keyOf={(column) => column.id}
        titleOf={columnTitle}
        detailOf={(column) =>
          column.property === null
            ? 'elements'
            : `${column.property}, ${SUMMARY_AGGREGATE_LABELS[column.aggregate]}`
        }
        canEdit={(column) => column.property !== null}
        onChange={(columns) => onView({ ...view, columns })}
        onEdit={(column) => open('column', { role: 'column', column })}
        onAdd={() => open('column')}
        addLabel="Add a column"
        addDisabled={columnsFull}
      >
        {view.columns.some((column) => column.property === null) ? null : (
          <button
            type="button"
            className="btn"
            disabled={columnsFull}
            onClick={() =>
              onView({ ...view, columns: [COUNT_COLUMN, ...view.columns] })
            }
          >
            Add element count
          </button>
        )}
      </OrderedEditor>
      <SettingsForm form={SUMMARY_FORM} value={value} onChange={onChange} />
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
    </>
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
