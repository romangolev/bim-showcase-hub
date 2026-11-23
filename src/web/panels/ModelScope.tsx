import { useId } from 'react';
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
    <div className="bsh-field bsh-scope">
      <label htmlFor={id} className="bsh-sr-only">
        {label}
      </label>
      <select
        id={id}
        className="field"
        value={state.scope}
        onChange={(event) => state.setScope(event.target.value)}
      >
        {state.options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
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
