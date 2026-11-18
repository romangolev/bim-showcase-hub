import type { ModelInfo } from '../viewer/modelSet.js';

export function isolatedModel(models: readonly ModelInfo[]): string | null {
  const shown = models.filter(
    (model) => model.status === 'ready' && model.visible,
  );
  const ready = models.filter((model) => model.status === 'ready');
  return shown.length === 1 && ready.length > 1 ? (shown[0]?.id ?? null) : null;
}

export function isolateVisibility(
  models: readonly ModelInfo[],
  id: string,
): Record<string, boolean> {
  const showAll = isolatedModel(models) === id;
  return Object.fromEntries(
    models
      .filter((model) => model.status === 'ready')
      .map((model) => [model.id, showAll || model.id === id]),
  );
}
