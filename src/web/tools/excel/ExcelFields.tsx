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
import { usePersisted } from '../../storage.js';
import { modelScopeOptions, resolveScope } from '../../viewer/modelScope.js';
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

export function ExcelFields() {
  const [excel, setExcel] = usePersisted(EXCEL_SETTINGS);
  const models = useModels(useActiveViewer());
  const modelOptions = modelScopeOptions(models);
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
        labels={SCOPE_LABELS}
        onChange={(scope) => update({ scope })}
      />
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
    </section>
  );
}
