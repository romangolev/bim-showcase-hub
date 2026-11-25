import { type ReactNode, useId } from 'react';
import { Button } from '../ui/Button.js';
import { Checkbox } from '../ui/Checkbox.js';
import { Field, FieldHint, FieldLabel, FieldTitle } from '../ui/Field.js';
import { Input } from '../ui/Input.js';
import { NumberField } from '../ui/NumberField.js';
import { Select, SelectOption } from '../ui/Select.js';
import { Slider } from '../ui/Slider.js';
import { SwitchRow } from './SwitchRow.js';

interface FieldBase {
  key: string;
  label: string;
  hint?: string;
}

export interface ToggleField extends FieldBase {
  kind: 'toggle';
}

export interface NumberFieldDef extends FieldBase {
  kind: 'number';
  min: number;
  max?: number;
  slider?: { step: number; format: (value: number) => string };
}

export interface SelectField extends FieldBase {
  kind: 'select';
  options: readonly { value: string; label: string }[];
}

export interface TextField extends FieldBase {
  kind: 'text';
  maxLength?: number;
}

export interface MultiField extends FieldBase {
  kind: 'multi';
  options: readonly { value: string; label: string }[];
}

export interface ListField extends FieldBase {
  kind: 'list';
  itemType: 'text' | 'color';
  newItem: string;
  min?: number;
  max?: number;
  addLabel: string;
  itemLabel: (index: number) => string;
  removeLabel: (index: number) => string;
}

export type FieldDef =
  | ToggleField
  | NumberFieldDef
  | SelectField
  | TextField
  | MultiField
  | ListField;

export interface FormDefinition<V extends object> {
  title?: string;
  intro?: string;
  fields: readonly FieldDef[];
  reset?: { label: string; patch: Partial<V> };
}

interface SettingsFormProps<V extends object> {
  form: FormDefinition<V>;
  value: V;
  onChange: (patch: Partial<V>) => void;
  className?: string;
}

export interface SettingsFieldProps {
  label: ReactNode;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
}

export function SettingsField({ label, hint, children }: SettingsFieldProps) {
  const id = useId();
  return (
    <Field layout="row" controlId={id}>
      <FieldLabel>{label}</FieldLabel>
      {children(id)}
      {hint ? <FieldHint>{hint}</FieldHint> : null}
    </Field>
  );
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

interface RowProps<F> {
  field: F;
  value: unknown;
  set: (value: unknown) => void;
}

function ToggleRow({ field, value, set }: RowProps<ToggleField>) {
  return (
    <SwitchRow
      label={field.label}
      description={field.hint}
      checked={value === true}
      onChange={() => set(value !== true)}
    />
  );
}

function NumberRow({ field, value, set }: RowProps<NumberFieldDef>) {
  const parsed = Number(value ?? Number.NaN);
  const current = Number.isFinite(parsed) ? parsed : field.min;
  if (field.slider) {
    const { step, format } = field.slider;
    return (
      <SettingsField
        label={`${field.label} ${format(current)}`}
        hint={field.hint}
      >
        {(id) => (
          <Slider
            id={id}
            min={field.min}
            max={field.max}
            step={step}
            value={current}
            onValueChange={set}
          />
        )}
      </SettingsField>
    );
  }
  return (
    <SettingsField label={field.label} hint={field.hint}>
      {(id) => (
        <NumberField
          id={id}
          min={field.min}
          max={field.max}
          value={current}
          onValueCommitted={set}
        />
      )}
    </SettingsField>
  );
}

function SelectRow({ field, value, set }: RowProps<SelectField>) {
  const selected = field.options.some((option) => option.value === value)
    ? String(value)
    : (field.options[0]?.value ?? '');
  return (
    <SettingsField label={field.label} hint={field.hint}>
      {(id) => (
        <Select id={id} value={selected} onValueChange={set}>
          {field.options.map((option) => (
            <SelectOption key={option.value} value={option.value}>
              {option.label}
            </SelectOption>
          ))}
        </Select>
      )}
    </SettingsField>
  );
}

function TextRow({ field, value, set }: RowProps<TextField>) {
  return (
    <SettingsField label={field.label} hint={field.hint}>
      {(id) => (
        <Input
          id={id}
          type="text"
          maxLength={field.maxLength}
          value={String(value ?? '')}
          onChange={(e) => set(e.target.value)}
        />
      )}
    </SettingsField>
  );
}

function MultiRow({ field, value, set }: RowProps<MultiField>) {
  const chosen = strings(value);
  return (
    <Field group layout="wrap" render={<fieldset />}>
      <legend>{field.label}</legend>
      {field.options.map((option) => (
        <FieldLabel layout="inline" key={option.value}>
          <Checkbox
            checked={chosen.includes(option.value)}
            onChange={() =>
              set(
                field.options
                  .map((item) => item.value)
                  .filter((item) =>
                    item === option.value
                      ? !chosen.includes(item)
                      : chosen.includes(item),
                  ),
              )
            }
          />
          {option.label}
        </FieldLabel>
      ))}
      {field.hint ? <FieldHint>{field.hint}</FieldHint> : null}
    </Field>
  );
}

function ListRow({ field, value, set }: RowProps<ListField>) {
  const items = strings(value);
  const min = field.min ?? 0;
  const Item = field.itemType === 'color' ? 'input' : Input;
  const titleId = useId();
  return (
    <Field group layout="row" role="group" aria-labelledby={titleId}>
      <FieldTitle id={titleId}>{field.label}</FieldTitle>
      <ul className="settings__palette">
        {items.map((item, index) => (
          <li key={index} className="settings__palette-item">
            <Item
              type={field.itemType}
              value={item}
              aria-label={field.itemLabel(index)}
              onChange={(event) =>
                set(
                  items.map((entry, at) =>
                    at === index
                      ? field.itemType === 'color'
                        ? event.target.value.toLowerCase()
                        : event.target.value
                      : entry,
                  ),
                )
              }
            />
            <Button
              aria-label={field.removeLabel(index)}
              disabled={items.length <= min}
              onClick={() => set(items.filter((_, at) => at !== index))}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <div className="settings__actions">
        <Button
          disabled={field.max !== undefined && items.length >= field.max}
          onClick={() => set([...items, field.newItem])}
        >
          {field.addLabel}
        </Button>
      </div>
      {field.hint ? <FieldHint>{field.hint}</FieldHint> : null}
    </Field>
  );
}

function renderField(
  field: FieldDef,
  value: unknown,
  set: (value: unknown) => void,
): ReactNode {
  switch (field.kind) {
    case 'toggle':
      return <ToggleRow field={field} value={value} set={set} />;
    case 'number':
      return <NumberRow field={field} value={value} set={set} />;
    case 'select':
      return <SelectRow field={field} value={value} set={set} />;
    case 'text':
      return <TextRow field={field} value={value} set={set} />;
    case 'multi':
      return <MultiRow field={field} value={value} set={set} />;
    case 'list':
      return <ListRow field={field} value={value} set={set} />;
  }
}

export function SettingsForm<V extends object>({
  form,
  value,
  onChange,
  className = 'settings__section',
}: SettingsFormProps<V>) {
  const titleId = useId();
  const values = value as Record<string, unknown>;
  return (
    <section
      className={className}
      aria-labelledby={form.title ? titleId : undefined}
    >
      {form.title ? (
        <h3 id={titleId} className="settings__heading">
          {form.title}
        </h3>
      ) : null}
      {form.intro ? <p className="settings__hint">{form.intro}</p> : null}
      {form.fields.map((field) => (
        <div key={field.key}>
          {renderField(field, values[field.key], (next) =>
            onChange({ [field.key]: next } as Partial<V>),
          )}
        </div>
      ))}
      {form.reset ? (
        <div className="settings__actions">
          <Button onClick={() => onChange(form.reset?.patch ?? {})}>
            {form.reset.label}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
