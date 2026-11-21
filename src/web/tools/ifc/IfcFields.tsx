import { useId, useState } from 'react';
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
  const id = useId();
  return (
    <div className="settings__field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onCommit(event.target.value)}
      />
    </div>
  );
}

interface ListFieldProps {
  label: string;
  values: string[];
  onCommit: (values: string[]) => void;
}

function ListField({ label, values, onCommit }: ListFieldProps) {
  const id = useId();
  const [text, setText] = useState(values.join(', '));
  return (
    <div className="settings__field">
      <label htmlFor={id}>{label}</label>
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
    </div>
  );
}

function OverrideEditor({
  overrides,
  onChange,
}: {
  overrides: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const categoryId = useId();
  const classId = useId();
  const [category, setCategory] = useState('');
  const [ifcClass, setIfcClass] = useState(PROXY_CLASS);
  const add = () => {
    const name = category.trim();
    if (!name) return;
    onChange({ ...overrides, [name]: ifcClass });
    setCategory('');
  };
  return (
    <div className="settings__overrides">
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
      <div className="settings__field">
        <label htmlFor={categoryId}>Category</label>
        <input
          id={categoryId}
          type="text"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        />
      </div>
      <div className="settings__field">
        <label htmlFor={classId}>IFC class</label>
        <select
          id={classId}
          value={ifcClass}
          onChange={(event) => setIfcClass(event.target.value)}
        >
          {ALLOWED_CLASSES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="settings__actions">
        <button type="button" className="btn" onClick={add}>
          Add override
        </button>
      </div>
    </div>
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
  const unitId = useId();
  return (
    <section className="settings__section" aria-labelledby="settings-ifc">
      <h3 id="settings-ifc" className="settings__heading">
        IFC export
      </h3>
      {TEXT_FIELDS.map(({ key, label }) => (
        <TextField
          key={key}
          label={label}
          value={ifc[key]}
          onCommit={(value) => update({ [key]: value })}
        />
      ))}
      <div className="settings__field">
        <label htmlFor={unitId}>Length unit</label>
        <select
          id={unitId}
          value={ifc.lengthUnit}
          onChange={(event) =>
            update({ lengthUnit: event.target.value === 'mm' ? 'mm' : 'm' })
          }
        >
          <option value="m">Metres</option>
          <option value="mm">Millimetres</option>
        </select>
      </div>
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
      <OverrideEditor
        overrides={ifc.classOverrides}
        onChange={(next) => update({ classOverrides: next })}
      />
    </section>
  );
}
