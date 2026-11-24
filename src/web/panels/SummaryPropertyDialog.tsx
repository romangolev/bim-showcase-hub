import {
  type FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Icon } from '../components/icons.js';
import { StateBlock } from '../components/StateBlock.js';
import {
  additionProblem,
  applyAddition,
  columnTitle,
  DEFAULT_PRECISION,
  MAX_PRECISION,
  MAX_PROPERTY_NAME,
  MAX_TITLE_LENGTH,
  MAX_UNIT_LABEL,
  NUMERIC_AGGREGATES,
  SUMMARY_AGGREGATE_LABELS,
  SUMMARY_AGGREGATES,
  type SummaryAddition,
  type SummaryAggregate,
  type SummaryColumnSpec,
  type SummaryView,
  sanitizeSummaryAggregate,
  summaryColumn,
} from '../extensions/modelSummary.js';
import { groupCatalog } from '../viewer/propertyCatalog.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { usePropertyCatalog } from './usePropertyCatalog.js';
import './panels.css';

export interface SummaryPropertyOptions {
  adapter: ViewerAdapter | null;
  rows: readonly string[];
  columns: readonly SummaryColumnSpec[];
  role?: SummaryAddition['role'];
  initial?: { property: string; aggregate?: SummaryAggregate };
  editing?: SummaryAddition;
  onSubmit: (addition: SummaryAddition) => void;
}

const GROUP_CAP = 100;

function parsePrecision(text: string): number {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value)
    ? DEFAULT_PRECISION
    : Math.min(MAX_PRECISION, Math.max(0, Math.floor(value)));
}

function SummaryPropertyDialog({
  adapter,
  rows,
  columns,
  role: startRole = 'column',
  initial,
  editing,
  onSubmit,
  onDone,
}: SummaryPropertyOptions & { onDone: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const titleId = `${uid}-title`;
  const problemId = `${uid}-problem`;
  const start = editing?.role === 'column' ? editing.column : null;
  const [role, setRole] = useState<SummaryAddition['role']>(
    editing?.role ?? startRole,
  );
  const [property, setProperty] = useState(
    editing?.role === 'rows'
      ? editing.property
      : (start?.property ?? initial?.property ?? ''),
  );
  const [aggregate, setAggregate] = useState<SummaryAggregate>(
    start?.aggregate ?? initial?.aggregate ?? 'count',
  );
  const [title, setTitle] = useState(start?.title ?? '');
  const [precisionText, setPrecisionText] = useState(
    String(start?.precision ?? DEFAULT_PRECISION),
  );
  const [category, setCategory] = useState<string | null>(null);
  const [unitLabel, setUnitLabel] = useState(start?.unitLabel ?? '');
  const [query, setQuery] = useState('');
  const catalog = usePropertyCatalog(adapter);
  const groups = useMemo(
    () => groupCatalog(catalog.catalog, query),
    [catalog.catalog, query],
  );
  const matches = groups.reduce(
    (total, group) => total + group.properties.length,
    0,
  );
  const known =
    catalog.status === 'ready'
      ? new Set(catalog.catalog.map((info) => info.name))
      : null;
  const owner =
    category ??
    groups.find((group) =>
      group.properties.some((info) => info.name === property),
    )?.category;
  const typed = query.trim().slice(0, MAX_PROPERTY_NAME);
  const precision = parsePrecision(precisionText);
  const numeric = NUMERIC_AGGREGATES.includes(aggregate);
  const addition: SummaryAddition =
    role === 'rows'
      ? { role: 'rows', property: property.trim() }
      : {
          role: 'column',
          column: summaryColumn(property, aggregate, {
            title,
            precision,
            unitLabel,
          }),
        };
  const problem = additionProblem(addition, rows, columns, editing);
  const generated = property.trim()
    ? columnTitle(summaryColumn(property, aggregate))
    : 'Column title';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    searchRef.current?.focus();
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (problem) return;
    onSubmit(addition);
    onDone();
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal bsh-add-property"
      aria-labelledby={titleId}
      onClose={onDone}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        onDone();
      }}
    >
      <form className="modal__panel" noValidate onSubmit={submit}>
        <header className="modal__head">
          <h2 id={titleId} className="modal__title">
            {editing ? 'Edit property' : 'Add property'}
          </h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={onDone}
          >
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="modal__body bsh-add-property__body">
          <label className="bsh-field">
            <span>Search properties</span>
            <input
              ref={searchRef}
              type="search"
              className="field"
              placeholder="Property name"
              maxLength={MAX_PROPERTY_NAME}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {!adapter ? (
            <StateBlock
              variant="empty"
              compact
              title="No model loaded"
              message="Type a property name to use it."
            />
          ) : null}
          {adapter && catalog.status === 'loading' ? (
            <>
              <StateBlock
                variant="loading"
                compact
                message={
                  catalog.progress
                    ? `Discovering properties, ${catalog.progress.loaded} of ${catalog.progress.total} elements`
                    : 'Discovering properties'
                }
                rows={2}
              />
              <button type="button" className="btn" onClick={catalog.cancel}>
                Cancel
              </button>
            </>
          ) : null}
          {catalog.status === 'cancelled' || catalog.status === 'error' ? (
            <StateBlock
              variant={catalog.status === 'error' ? 'error' : 'empty'}
              compact
              message="The property list is not available. Type a name instead."
              action={{ label: 'Retry', onClick: catalog.reload }}
            />
          ) : null}
          {catalog.status === 'ready' ? (
            <p role="status" className="bsh-picker__none">
              {`${matches} ${matches === 1 ? 'property matches' : 'properties match'}`}
            </p>
          ) : null}
          {typed && !known?.has(typed) ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setProperty(typed);
                setCategory(null);
              }}
            >
              {`Use "${typed}"`}
            </button>
          ) : null}
          <div className="bsh-picker__groups bsh-add-property__results">
            {groups.map((group) => (
              <fieldset key={group.category} className="bsh-picker__group">
                <legend>{group.category}</legend>
                {group.properties.slice(0, GROUP_CAP).map((info) => (
                  <label
                    key={`${info.category}\u0000${info.name}`}
                    className="settings__check"
                  >
                    <input
                      type="radio"
                      name={`${uid}-property`}
                      checked={
                        property === info.name && info.category === owner
                      }
                      onChange={() => {
                        setProperty(info.name);
                        setCategory(info.category);
                      }}
                    />
                    {info.name}
                  </label>
                ))}
                {group.properties.length > GROUP_CAP ? (
                  <p className="bsh-picker__none">
                    {group.properties.length - GROUP_CAP} more, refine the
                    search
                  </p>
                ) : null}
              </fieldset>
            ))}
          </div>
          {property.trim() ? (
            <p className="settings__hint">
              Chosen: <strong>{property.trim()}</strong>
              {known && !known.has(property.trim()) ? (
                <span className="bsh-add-property__missing">
                  <Icon name="alert" size={12} />
                  <span>Not in this model</span>
                </span>
              ) : null}
            </p>
          ) : null}
          <fieldset
            className="bsh-add-property__roles"
            disabled={editing !== undefined}
          >
            <legend>Show as</legend>
            <div className="bsh-kinds">
              <label className="btn">
                <input
                  type="radio"
                  name={`${uid}-role`}
                  checked={role === 'rows'}
                  onChange={() => setRole('rows')}
                />
                Rows
              </label>
              <label className="btn">
                <input
                  type="radio"
                  name={`${uid}-role`}
                  checked={role === 'column'}
                  onChange={() => setRole('column')}
                />
                Column
              </label>
            </div>
          </fieldset>
          {role === 'column' ? (
            <>
              <label className="settings__field">
                Aggregate
                <select
                  value={aggregate}
                  onChange={(event) =>
                    setAggregate(sanitizeSummaryAggregate(event.target.value))
                  }
                >
                  {SUMMARY_AGGREGATES.map((name) => (
                    <option key={name} value={name}>
                      {SUMMARY_AGGREGATE_LABELS[name]}
                    </option>
                  ))}
                </select>
              </label>
              {numeric ? (
                <p className="settings__hint">
                  Reads the trailing unit; different unit families are reported,
                  not summed.
                </p>
              ) : null}
              <label className="settings__field">
                Title
                <input
                  type="text"
                  maxLength={MAX_TITLE_LENGTH}
                  placeholder={generated}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              {numeric ? (
                <>
                  <label className="settings__field">
                    Decimal places
                    <input
                      type="number"
                      min={0}
                      max={MAX_PRECISION}
                      value={precisionText}
                      onChange={(event) => setPrecisionText(event.target.value)}
                      onBlur={() => setPrecisionText(String(precision))}
                    />
                  </label>
                  <label className="settings__field">
                    Unit label
                    <input
                      type="text"
                      maxLength={MAX_UNIT_LABEL}
                      placeholder="Unit read from the values"
                      value={unitLabel}
                      onChange={(event) => setUnitLabel(event.target.value)}
                    />
                  </label>
                </>
              ) : null}
            </>
          ) : null}
          {problem ? (
            <p id={problemId} className="settings__hint" role="status">
              {problem}
            </p>
          ) : null}
          <div className="bsh-presets">
            <button type="button" className="btn" onClick={onDone}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn"
              disabled={problem !== null}
              aria-describedby={problem ? problemId : undefined}
            >
              {editing ? 'Save' : 'Add property'}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}

export function openSummaryProperty({
  properties,
  view,
  apply,
  ...options
}: Omit<SummaryPropertyOptions, 'rows' | 'columns' | 'onSubmit'> & {
  properties: readonly string[];
  view: SummaryView;
  apply: (next: { properties: string[]; view: SummaryView }) => void;
}): void {
  promptSummaryProperty({
    ...options,
    rows: properties,
    columns: view.columns,
    onSubmit: (addition) =>
      apply(applyAddition(properties, view, addition, options.editing)),
  });
}

export function promptSummaryProperty(options: SummaryPropertyOptions): void {
  const opener =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let closed = false;
  const done = () => {
    if (closed) return;
    closed = true;
    root.unmount();
    host.remove();
    if (opener?.isConnected) opener.focus();
  };
  flushSync(() =>
    root.render(<SummaryPropertyDialog {...options} onDone={done} />),
  );
}
