import { useId } from 'react';
import {
  type ExcelSettings,
  type ExportFormat,
  type ExportScope,
  FORMAT_LABELS,
  SCOPE_LABELS,
} from '../extensions/exportFormats.js';
import { useSettings } from './SettingsContext.js';

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

export function ExcelSettingsSection() {
  const { settings, setSetting } = useSettings();
  const excel = settings.excel;
  const patternId = useId();
  const metadataId = useId();
  const update = (patch: Partial<ExcelSettings>) =>
    setSetting('excel', { ...excel, ...patch });
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
      <div className="settings__field">
        <label htmlFor={metadataId}>
          <input
            id={metadataId}
            type="checkbox"
            checked={excel.metadata}
            onChange={(event) => update({ metadata: event.target.checked })}
          />{' '}
          Add an About sheet (Excel) or about block (JSON)
        </label>
      </div>
    </section>
  );
}
