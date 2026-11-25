import { useContext } from 'react';
import { SettingsField } from '../../components/SettingsForm.js';
import { SwitchRow } from '../../components/SwitchRow.js';
import {
  COLUMN_FORMAT_LABELS,
  COLUMN_FORMATS,
  CONFIRM_ABOVE_MAX,
  type ColumnFormat,
  type CsvDelimiter,
  DECIMAL_LABELS,
  DELIMITER_LABELS,
  type DecimalMark,
  EMPTY_LABELS,
  type EmptyLabel,
  type ExportFormat,
  type ExportScope,
  FORMAT_LABELS,
  SCOPE_LABELS,
} from '../../extensions/exportFormats.js';
import { LayoutContext } from '../../layout/layoutContext.js';
import { PropertyPicker } from '../../panels/PropertyPicker.js';
import { SelectionSets } from '../../panels/SelectionSets.js';
import { usePropertyCatalog } from '../../panels/usePropertyCatalog.js';
import { usePersisted } from '../../storage.js';
import { Button } from '../../ui/Button.js';
import { Input } from '../../ui/Input.js';
import { NumberField } from '../../ui/NumberField.js';
import { Select, SelectOption } from '../../ui/Select.js';
import { usePublishedAdapter } from '../../viewer/activeAdapterStore.js';
import { useModelColoring } from '../../viewer/modelColoring.js';
import { modelScopeOptions, resolveScope } from '../../viewer/modelScope.js';
import { type ScopeCount, useScopeCount } from '../../viewer/scopeCount.js';
import { useSelectionSets, withSetLabels } from '../../viewer/selectionSets.js';
import { useModels } from '../../viewer/useModels.js';
import { useActiveViewer } from '../../viewer/ViewerContext.js';
import { EXCEL_SETTINGS, type ExcelToolSettings } from './excelSettings.js';
import { PresetFields } from './PresetFields.js';

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
  return (
    <SettingsField label={label}>
      {(id) => (
        <>
          <Select
            id={id}
            value={value}
            onValueChange={(next) => onChange(next as T)}
          >
            {(Object.keys(labels) as T[]).map((key) => (
              <SelectOption key={key} value={key}>
                {labels[key]}
              </SelectOption>
            ))}
          </Select>
        </>
      )}
    </SettingsField>
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

function withFormat(
  formats: Record<string, ColumnFormat>,
  name: string,
  format: ColumnFormat,
): Record<string, ColumnFormat> {
  const next = { ...formats };
  if (format === 'auto') delete next[name];
  else next[name] = format;
  return next;
}

export function ExcelFields() {
  const [excel, setExcel] = usePersisted(EXCEL_SETTINGS);
  const layout = useContext(LayoutContext);
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
  const catalogState = usePropertyCatalog(viewer);
  const coloring = useModelColoring(viewer);
  const catalog = [...new Set(catalogState.catalog.map((info) => info.name))];
  const groupBy =
    excel.groupBy !== null && excel.properties.includes(excel.groupBy)
      ? excel.groupBy
      : '';
  const update = (patch: Partial<ExcelToolSettings>) =>
    setExcel((current) => ({ ...current, ...patch }));
  return (
    <section className="settings__section" aria-labelledby="settings-excel">
      <h3 id="settings-excel" className="settings__heading">
        Table export
      </h3>
      {layout && !layout.isOpen('export') ? (
        <div className="settings__actions">
          <Button onClick={() => layout.togglePane('export')}>
            Open Export pane
          </Button>
        </div>
      ) : null}
      <p className="settings__hint">
        Exported data stays in your browser. Text that starts with =, +, - or @
        is prefixed with an apostrophe so it cannot run as a spreadsheet
        formula. Excel files write numbers as numbers and end with a totals row:
        sums for number columns, value counts for text columns. CSV, JSON and
        copy keep plain values and have no totals row.
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
      <fieldset className="settings__section">
        <legend className="settings__heading">Columns</legend>
        <PropertyPicker
          adapter={viewer}
          value={excel.properties}
          onChange={(properties) => update({ properties })}
        />
      </fieldset>
      <details>
        <summary>Column formats</summary>
        {excel.properties.map((name) => {
          return (
            <SettingsField key={name} label={<>Format of {name}</>}>
              {(id) => (
                <>
                  <Select
                    id={id}
                    value={excel.columnFormats[name] ?? 'auto'}
                    onValueChange={(next) =>
                      update({
                        columnFormats: withFormat(
                          excel.columnFormats,
                          name,
                          next as ColumnFormat,
                        ),
                      })
                    }
                  >
                    {COLUMN_FORMATS.map((format) => (
                      <SelectOption key={format} value={format}>
                        {COLUMN_FORMAT_LABELS[format]}
                      </SelectOption>
                    ))}
                  </Select>
                </>
              )}
            </SettingsField>
          );
        })}
      </details>
      <SwitchRow
        label="Add a Color column and a Color hex column"
        checked={excel.colorColumn}
        disabled={!coloring}
        onChange={() => update({ colorColumn: !excel.colorColumn })}
      />
      <SwitchRow
        label="Add a Legend sheet to the Excel file"
        description={
          coloring ? undefined : 'Color the model in the Colors pane first'
        }
        checked={excel.legendSheet}
        disabled={!coloring}
        onChange={() => update({ legendSheet: !excel.legendSheet })}
      />
      <PresetFields current={excel} apply={update} catalog={catalog} />
      <SettingsField
        label="Group by"
        hint="Excel files get one sheet per value of a chosen column."
      >
        {(id) => (
          <>
            <Select
              id={id}
              value={groupBy}
              onValueChange={(next) => update({ groupBy: next || null })}
            >
              <SelectOption value="">One sheet</SelectOption>
              {excel.properties.map((name) => (
                <SelectOption key={name} value={name}>
                  {name}
                </SelectOption>
              ))}
            </Select>
          </>
        )}
      </SettingsField>
      <SettingsField
        label="File name pattern"
        hint={
          <>
            Use {'{model}'} and {'{date}'}.
          </>
        }
      >
        {(id) => (
          <>
            <Input
              id={id}
              type="text"
              value={excel.namePattern}
              onChange={(event) => update({ namePattern: event.target.value })}
            />
          </>
        )}
      </SettingsField>
      <SettingsField
        label="Ask before exporting over rows"
        hint={
          excel.confirmAbove === 0
            ? 'Never asks.'
            : `Asks above ${excel.confirmAbove.toLocaleString('en-US')} rows.`
        }
      >
        {(id) => (
          <>
            <NumberField
              id={id}
              min={0}
              max={CONFIRM_ABOVE_MAX}
              value={excel.confirmAbove}
              onValueCommitted={(confirmAbove) => update({ confirmAbove })}
            />
          </>
        )}
      </SettingsField>
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
      <SelectField<EmptyLabel>
        label="Empty cells"
        value={excel.emptyLabel}
        labels={EMPTY_LABELS}
        onChange={(emptyLabel) => update({ emptyLabel })}
      />
      <SwitchRow
        label="Include the header row in CSV and copy"
        checked={excel.includeHeader}
        onChange={() => update({ includeHeader: !excel.includeHeader })}
      />
      <SwitchRow
        label="Add a Summary sheet to the Excel file"
        checked={excel.summarySheet}
        onChange={() => update({ summarySheet: !excel.summarySheet })}
      />
      <SwitchRow
        label="Name this app as the exporter in the About data"
        checked={excel.exporterName}
        onChange={() => update({ exporterName: !excel.exporterName })}
      />
      <SwitchRow
        label="Add an About sheet (XLSX) or about block (JSON)"
        description="Not used for CSV or copy."
        checked={excel.metadata}
        onChange={() => update({ metadata: !excel.metadata })}
      />
      <SelectionSets adapter={viewer} />
    </section>
  );
}
