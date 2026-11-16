import type { PropertyRow } from '../../shared/types.js';
import type { ModelInfo } from './modelSet.js';

export const ALL_MODELS = 'all';
export const ALL_MODELS_LABEL = 'All models';

export type ModelScope = string;

export interface ModelScopeOption {
  id: ModelScope;
  label: string;
}

export function modelScopeOptions(
  models: readonly ModelInfo[],
): ModelScopeOption[] {
  const ready = models.filter((model) => model.status === 'ready');
  if (ready.length < 2) return [];
  return [
    { id: ALL_MODELS, label: ALL_MODELS_LABEL },
    ...ready.map((model) => ({ id: model.id, label: model.name })),
  ];
}

export function resolveScope(
  scope: ModelScope,
  models: readonly ModelInfo[],
): ModelScope {
  if (scope === ALL_MODELS) return scope;
  const match = models.find((model) => model.id === scope);
  return match?.status === 'ready' ? scope : ALL_MODELS;
}

export function scopeRows<T extends PropertyRow>(
  rows: readonly T[],
  scope: ModelScope,
): T[] {
  if (scope === ALL_MODELS) return [...rows];
  return rows.filter((row) => row.modelId === scope);
}

export function distinctModelCount(rows: readonly PropertyRow[]): number {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.modelId !== undefined) ids.add(row.modelId);
  }
  return ids.size;
}

export function unavailableModels(models: readonly ModelInfo[]): ModelInfo[] {
  return models.filter(
    (model) =>
      model.status === 'ready' && model.visible && model.propertiesError,
  );
}

export function tagRows(
  rows: readonly PropertyRow[],
  model: Pick<ModelInfo, 'id' | 'name'>,
): PropertyRow[] {
  return rows.map((row) => ({
    ...row,
    modelId: model.id,
    modelName: model.name,
  }));
}
