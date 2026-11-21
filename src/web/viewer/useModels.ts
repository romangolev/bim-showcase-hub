import { useEffect, useState } from 'react';
import type { ModelInfo } from './modelSet.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

const NO_MODELS: ModelInfo[] = [];

interface ModelsState {
  adapter: ViewerAdapter | null;
  models: ModelInfo[];
}

function snapshot(adapter: ViewerAdapter | null): ModelInfo[] {
  if (!adapter) return NO_MODELS;
  return adapter.getModels();
}

function sameModels(a: readonly ModelInfo[], b: readonly ModelInfo[]): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

export function useModels(adapter: ViewerAdapter | null): ModelInfo[] {
  const [state, setState] = useState<ModelsState>(() => ({
    adapter,
    models: snapshot(adapter),
  }));
  useEffect(() => {
    const update = (next: ModelInfo[]) =>
      setState((prev) =>
        prev.adapter === adapter && sameModels(prev.models, next)
          ? prev
          : { adapter, models: next },
      );
    update(snapshot(adapter));
    if (!adapter || typeof adapter.onModelsChange !== 'function') return;
    return adapter.onModelsChange(update);
  }, [adapter]);
  return state.adapter === adapter ? state.models : snapshot(adapter);
}
