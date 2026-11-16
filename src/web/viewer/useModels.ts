import { useEffect, useState } from 'react';
import { type ModelInfo, readySignature } from './modelSet.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

const NO_MODELS: ModelInfo[] = [];

function snapshot(adapter: ViewerAdapter | null): ModelInfo[] {
  if (!adapter || typeof adapter.getModels !== 'function') return NO_MODELS;
  return adapter.getModels();
}

export function useModels(adapter: ViewerAdapter | null): ModelInfo[] {
  const [models, setModels] = useState<ModelInfo[]>(() => snapshot(adapter));
  useEffect(() => {
    setModels(snapshot(adapter));
    if (!adapter || typeof adapter.onModelsChange !== 'function') return;
    return adapter.onModelsChange(setModels);
  }, [adapter]);
  return models;
}

export function useReadySignature(adapter: ViewerAdapter | null): string {
  return readySignature(useModels(adapter));
}
