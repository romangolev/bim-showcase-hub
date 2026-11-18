import { useId } from 'react';
import {
  type CsvDelimiter,
  DECIMAL_LABELS,
  DELIMITER_LABELS,
  type DecimalMark,
  type ExportFormat,
  type ExportScope,
  FORMAT_LABELS,
  SCOPE_LABELS,
} from '../../extensions/exportFormats.js';
import { PropertyPicker } from '../../panels/PropertyPicker.js';
import { SelectionSets } from '../../panels/SelectionSets.js';
import { usePersisted } from '../../storage.js';
import { usePublishedAdapter } from '../../viewer/activeAdapterStore.js';
import { modelScopeOptions, resolveScope } from '../../viewer/modelScope.js';
import { type ScopeCount, useScopeCount } from '../../viewer/scopeCount.js';
import { useSelectionSets, withSetLabels } from '../../viewer/selectionSets.js';
import { useModels } from '../../viewer/useModels.js';
import { useActiveViewer } from '../../viewer/ViewerContext.js';
import { EXCEL_SETTINGS, type ExcelToolSettings } from './excelSettings.js';

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  labels: Record<T, string>;
  onChange: (value: T) => void;
}

function SelectField<T extends string>({
  label,
  value,
  labels,
  onChange,
}: SelectFieldProps<T>) {
  const id = useId();
  return (
    <div className="settings__field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {(Object.keys(labels) as T[]).map((key) => (
          <option key={key} value={key}>
            {labels[key]}
          </option>
        ))}
      </select>
    </div>
  );
}

function rowsMessage(count: ScopeCount): string {
  switch (count.status) {
    case 'ready':
      return `Rows to export: ${count.count.toLocaleString('en-US')}`;
    case 'none':
      return 'Rows to export: n/a, no model is shown';
    case 'large':
      return 'Rows to export: not counted, the model is large.';
    case 'error':
      return 'Rows to export: could not be counted';
    default:
      return 'Rows to export: counting…';
  }
}

export function ExcelFields() {
  const [excel, setExcel] = usePersisted(EXCEL_SETTINGS);
  const active = useActiveViewer();
  const published = usePublishedAdapter();
  const viewer = active ?? published;
  const models = useModels(viewer);
  const modelOptions = modelScopeOptions(models);
  const scopeLabels = withSetLabels(
    SCOPE_LABELS,
    excel.scope,
    useSelectionSets(),
  );
  const { count, countNow } = useScopeCount(
    viewer,
    {
      models: resolveScope(excel.modelScope, models),
      elements: excel.scope,
    },
    excel.properties,
  );
  const patternId = useId();
  const metadataId = useId();
  const headerId = useId();
  const exporterId = useId();
  const summaryId = useId();
  const update = (patch: Partial<ExcelToolSettings>) =>
    setExcel((current) => ({ ...current, ...patch }));
  return (
    <section className="settings__section" aria-labelledby="settings-excel">
      <h3 id="settings-excel" className="settings__heading">
        Table export
      </h3>
      <p className="settings__hint">
        Exported data stays in your browser. Text that starts with =, +, - or @
        is prefixed with an apostrophe so it cannot run as a spreadsheet
        formula.
      </p>
      <SelectField<ExportFormat>
        label="Format"
        value={excel.format}
        labels={FORMAT_LABELS}
        onChange={(format) => update({ format })}
      />
      <SelectField<ExportScope>
        label="Rows"
        value={excel.scope}
        labels={scopeLabels}
        onChange={(scope) => update({ scope })}
      />
      {viewer ? (
        <p className="settings__hint" role="status">
          {rowsMessage(count)}
          {count.status === 'large' ? (
            <>
              {' '}
              <button type="button" onClick={countNow}>
                Count now
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      {modelOptions.length > 0 ? (
        <SelectField<string>
          label="Models"
          value={resolveScope(excel.modelScope, models)}
          labels={Object.fromEntries(
            modelOptions.map((option) => [option.id, option.label]),
          )}
          onChange={(modelScope) => update({ modelScope })}
        />
      ) : null}
      <fieldset className="bsh-fieldset">
        <legend>Columns</legend>
        <PropertyPicker
          adapter={viewer}
          value={excel.properties}
          onChange={(properties) => update({ properties })}
        />
      </fieldset>
      <div className="settings__field">
        <label htmlFor={patternId}>File name pattern</label>
        <input
          id={patternId}
          type="text"
          value={excel.namePattern}
          onChange={(event) => update({ namePattern: event.target.value })}
        />
        <span className="settings__hint">
          Use {'{model}'} and {'{date}'}.
        </span>
      </div>
      <SelectField<CsvDelimiter>
        label="CSV and copy delimiter"
        value={excel.csvDelimiter}
        labels={DELIMITER_LABELS}
        onChange={(csvDelimiter) => update({ csvDelimiter })}
      />
      <SelectField<DecimalMark>
        label="CSV and copy decimal mark"
        value={excel.decimalMark}
        labels={DECIMAL_LABELS}
        onChange={(decimalMark) => update({ decimalMark })}
      />
      <div className="settings__field">
        <label htmlFor={headerId}>
          <input
            id={headerId}
            type="checkbox"
            checked={excel.includeHeader}
            onChange={(event) =>
              update({ includeHeader: event.target.checked })
            }
          />{' '}
          Include the header row in CSV and copy
        </label>
      </div>
      <div className="settings__field">
        <label htmlFor={summaryId}>
          <input
            id={summaryId}
            type="checkbox"
            checked={excel.summarySheet}
            onChange={(event) => update({ summarySheet: event.target.checked })}
          />{' '}
          Add a Summary sheet to the Excel file
        </label>
      </div>
      <div className="settings__field">
        <label htmlFor={exporterId}>
          <input
            id={exporterId}
            type="checkbox"
            checked={excel.exporterName}
            onChange={(event) => update({ exporterName: event.target.checked })}
          />{' '}
          Name this app as the exporter in the About data
        </label>
      </div>
      <div className="settings__field">
        <label htmlFor={metadataId}>
          <input
            id={metadataId}
            type="checkbox"
            checked={excel.metadata}
            onChange={(event) => update({ metadata: event.target.checked })}
          />{' '}
          Add an About sheet (XLSX) or about block (JSON). Not used for CSV or
          copy
        </label>
      </div>
      <SelectionSets adapter={viewer} />
    </section>
  );
}
