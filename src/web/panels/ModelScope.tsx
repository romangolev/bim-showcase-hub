import { useId } from 'react';
import { Field } from '../ui/Field.js';
import { Select, SelectOption } from '../ui/Select.js';
import type { ModelInfo } from '../viewer/modelSet.js';
import type { ModelScopeControl } from './useScopedRows.js';

export function ModelScopeSelect({
  state,
  label,
}: {
  state: ModelScopeControl;
  label: string;
}) {
  const id = useId();
  if (state.options.length === 0) return null;
  return (
    <Field layout="inline" variant="quiet" className="bsh-scope">
      <label htmlFor={id} className="bsh-sr-only">
        {label}
      </label>
      <Select
        id={id}
        value={state.scope}
        onValueChange={(next) => state.setScope(next)}
      >
        {state.options.map((option) => (
          <SelectOption key={option.id} value={option.id}>
            {option.label}
          </SelectOption>
        ))}
      </Select>
    </Field>
  );
}

export function UnavailableModels({ models }: { models: ModelInfo[] }) {
  if (models.length === 0) return null;
  return (
    <p className="bsh-scope__notice" role="status">
      {`Properties unavailable for ${models.map((model) => model.name).join(', ')}. Counts cover the other models.`}
    </p>
  );
}

export function FailedModels({
  names,
  unavailable,
}: {
  names: string[];
  unavailable: ModelInfo[];
}) {
  const failed = names.filter(
    (name) => !unavailable.some((model) => model.name === name),
  );
  if (failed.length === 0) return null;
  return (
    <p className="bsh-scope__notice" role="status">
      {`${failed.length} model${failed.length === 1 ? '' : 's'} failed to load: ${failed.join(', ')}. Counts cover the other models.`}
    </p>
  );
}
