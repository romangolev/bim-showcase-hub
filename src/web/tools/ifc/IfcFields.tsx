import { useId, useState } from 'react';
import { SettingsField } from '../../components/SettingsForm.js';
import { ALLOWED_CLASSES, PROXY_CLASS } from '../../ifc/classTable.js';
import { usePersisted } from '../../storage.js';
import { IFC_SETTINGS, type IfcToolSettings } from './ifcSettings.js';

type TextKey =
  | 'projectName'
  | 'siteName'
  | 'buildingName'
  | 'author'
  | 'organisation'
  | 'levelProperty'
  | 'fallbackStorey';

interface TextFieldProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}

function TextField({ label, value, onCommit }: TextFieldProps) {
  return (
    <SettingsField label={label}>
      {(id) => (
        <>
          <input
            id={id}
            type="text"
            value={value}
            onChange={(event) => onCommit(event.target.value)}
          />
        </>
      )}
    </SettingsField>
  );
}

interface ListFieldProps {
  label: string;
  values: string[];
  onCommit: (values: string[]) => void;
}

function ListField({ label, values, onCommit }: ListFieldProps) {
  const [text, setText] = useState(values.join(', '));
  return (
    <SettingsField label={label}>
      {(id) => (
        <>
          <input
            id={id}
            type="text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onBlur={() => {
              const next = text
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean);
              onCommit(next);
              setText(next.join(', '));
            }}
          />
        </>
      )}
    </SettingsField>
  );
}

function OverrideEditor({
  overrides,
  onChange,
}: {
  overrides: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const headingId = useId();
  const [category, setCategory] = useState('');
  const [ifcClass, setIfcClass] = useState(PROXY_CLASS);
  const add = () => {
    const name = category.trim();
    if (!name) return;
    onChange({ ...overrides, [name]: ifcClass });
    setCategory('');
  };
  return (
    <section className="settings__section" aria-labelledby={headingId}>
      <h3 id={headingId} className="settings__heading">
        Class overrides
      </h3>
      <p className="settings__hint">
        Export every element of a category as another IFC class.
      </p>
      {Object.keys(overrides).length > 0 ? (
        <ul className="settings__override-list">
          {Object.entries(overrides).map(([name, target]) => (
            <li key={name} className="settings__override">
              <span>{name}</span>
              <span>{target}</span>
              <button
                type="button"
                className="btn btn-small"
                aria-label={`Remove ${name}`}
                onClick={() => {
                  const { [name]: _removed, ...rest } = overrides;
                  onChange(rest);
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <SettingsField label="Category">
        {(id) => (
          <>
            <input
              id={id}
              type="text"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            />
          </>
        )}
      </SettingsField>
      <SettingsField label="IFC class">
        {(id) => (
          <>
            <select
              id={id}
              value={ifcClass}
              onChange={(event) => setIfcClass(event.target.value)}
            >
              {ALLOWED_CLASSES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </>
        )}
      </SettingsField>
      <div className="settings__actions">
        <button type="button" className="btn" onClick={add}>
          Add override
        </button>
      </div>
    </section>
  );
}

const TEXT_FIELDS: readonly { key: TextKey; label: string }[] = [
  { key: 'projectName', label: 'Project name' },
  { key: 'siteName', label: 'Site name' },
  { key: 'buildingName', label: 'Building name' },
  { key: 'author', label: 'Author' },
  { key: 'organisation', label: 'Organisation' },
  { key: 'levelProperty', label: 'Level property' },
  { key: 'fallbackStorey', label: 'Fallback storey' },
];

export function IfcFields() {
  const [ifc, setIfc] = usePersisted(IFC_SETTINGS);
  const update = (patch: Partial<IfcToolSettings>) =>
    setIfc((current) => ({ ...current, ...patch }));
  return (
    <>
      <section className="settings__section" aria-labelledby="settings-ifc">
        <h3 id="settings-ifc" className="settings__heading">
          IFC file
        </h3>
        {TEXT_FIELDS.map(({ key, label }) => (
          <TextField
            key={key}
            label={label}
            value={ifc[key]}
            onCommit={(value) => update({ [key]: value })}
          />
        ))}
        <SettingsField label="Length unit">
          {(id) => (
            <>
              <select
                id={id}
                value={ifc.lengthUnit}
                onChange={(event) =>
                  update({
                    lengthUnit: event.target.value === 'mm' ? 'mm' : 'm',
                  })
                }
              >
                <option value="m">Metres</option>
                <option value="mm">Millimetres</option>
              </select>
            </>
          )}
        </SettingsField>
        <ListField
          label="Include property groups"
          values={ifc.psetInclude}
          onCommit={(values) => update({ psetInclude: values })}
        />
        <ListField
          label="Exclude property groups"
          values={ifc.psetExclude}
          onCommit={(values) => update({ psetExclude: values })}
        />
      </section>
      <OverrideEditor
        overrides={ifc.classOverrides}
        onChange={(next) => update({ classOverrides: next })}
      />
    </>
  );
}
