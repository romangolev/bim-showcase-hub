import { useId, useMemo, useState } from 'react';
import type { PropertyRow } from '../../shared/types.js';
import {
  ALL_MODELS,
  type ModelScope,
  type ModelScopeOption,
  modelScopeOptions,
  resolveScope,
  scopeRows,
  unavailableModels,
} from '../viewer/modelScope.js';
import type { ModelInfo } from '../viewer/modelSet.js';
import { useModels } from '../viewer/useModels.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';

export interface ModelScopeState {
  options: ModelScopeOption[];
  scope: ModelScope;
  setScope: (scope: ModelScope) => void;
  rows: PropertyRow[];
  unavailable: ModelInfo[];
}

export function useModelScope(
  adapter: ViewerAdapter | null,
  rows: PropertyRow[],
  controlled?: { value: ModelScope; onChange: (scope: ModelScope) => void },
): ModelScopeState {
  const models = useModels(adapter);
  const [inner, setInner] = useState<ModelScope>(ALL_MODELS);
  const chosen = controlled?.value ?? inner;
  const setScope = controlled?.onChange ?? setInner;
  const options = useMemo(() => modelScopeOptions(models), [models]);
  const scope = options.length > 0 ? resolveScope(chosen, models) : ALL_MODELS;
  const scoped = useMemo(() => scopeRows(rows, scope), [rows, scope]);
  const unavailable = useMemo(() => unavailableModels(models), [models]);
  return { options, scope, setScope, rows: scoped, unavailable };
}

export function ModelScopeSelect({
  state,
  label,
}: {
  state: ModelScopeState;
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
        className="bsh-select"
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
