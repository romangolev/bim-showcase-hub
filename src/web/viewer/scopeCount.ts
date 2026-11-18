import { useEffect, useState } from 'react';
import { ALL_MODELS, type ModelScope, resolveScope } from './modelScope.js';
import type { ModelInfo } from './modelSet.js';
import {
  applyScope,
  type ElementScope,
  resolveElementScope,
  scopeElementItems,
} from './propertyScope.js';
import { useSelectionSets } from './selectionSets.js';
import { peekLeafRows, readLeafRows } from './sharedLeafRows.js';
import { useModels } from './useModels.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

export const LARGE_MODEL_FRAGMENTS = 100_000;

export interface ScopeScope {
  models?: ModelScope;
  elements?: ElementScope;
}

export async function countScopedRows(
  adapter: ViewerAdapter,
  scope: ScopeScope,
  read?: { names: readonly string[]; signal: AbortSignal },
): Promise<number | null> {
  const models = adapter.getModels();
  const model = resolveScope(scope.models ?? ALL_MODELS, models);
  const modelIds = model === ALL_MODELS ? undefined : [model];
  const rows =
    peekLeafRows(adapter, modelIds) ??
    (read
      ? await readLeafRows(adapter, read.names, {
          signal: read.signal,
          ...(modelIds ? { modelIds } : {}),
        })
      : null);
  if (!rows) return null;
  const elements = resolveElementScope(scope.elements ?? 'all');
  const items = await scopeElementItems(adapter, elements);
  return applyScope(rows, { elements }, items, models[0]?.id).length;
}

export type ScopeCount =
  | { status: 'none' | 'counting' | 'large' | 'error' }
  | { status: 'ready'; count: number };

function shownWeight(adapter: ViewerAdapter, models: ModelInfo[]): number {
  return models
    .filter((m) => m.status === 'ready' && m.visible)
    .reduce((sum, m) => sum + (adapter.getModelWeight(m.id) ?? 0), 0);
}

export function useScopeCount(
  adapter: ViewerAdapter | null,
  scope: ScopeScope,
  names: readonly string[] = [],
): { count: ScopeCount; countNow: () => void } {
  const [count, setCount] = useState<ScopeCount>({ status: 'counting' });
  const [tick, setTick] = useState(0);
  const [forced, setForced] = useState<ViewerAdapter | null>(null);
  const models = useModels(adapter);
  const sets = useSelectionSets();
  const signature = `${models.map((m) => `${m.id}:${m.status}:${m.visible}`).join()}|${sets.map((set) => `${set.id}:${set.items.length}`).join()}`;
  const elements = scope.elements ?? 'all';
  const modelScope = scope.models ?? ALL_MODELS;
  const nameKey = names.join('\0');

  useEffect(() => {
    if (!adapter) return;
    const bump = () => setTick((n) => n + 1);
    const offSelection = adapter.onSelectionChange(bump);
    const offVisibility = adapter.onVisibilityChange(bump);
    return () => {
      offSelection();
      offVisibility();
    };
  }, [adapter]);

  useEffect(() => {
    if (!adapter || !models.some((m) => m.status === 'ready' && m.visible)) {
      setCount({ status: 'none' });
      return;
    }
    const controller = new AbortController();
    const manual =
      forced !== adapter &&
      shownWeight(adapter, models) > LARGE_MODEL_FRAGMENTS;
    const read = manual
      ? undefined
      : {
          names: nameKey ? nameKey.split('\0') : [],
          signal: controller.signal,
        };
    countScopedRows(adapter, { models: modelScope, elements }, read).then(
      (next) => {
        if (controller.signal.aborted) return;
        setCount(
          next === null
            ? { status: 'large' }
            : { status: 'ready', count: next },
        );
      },
      () => {
        if (!controller.signal.aborted) setCount({ status: 'error' });
      },
    );
    return () => controller.abort();
  }, [adapter, elements, modelScope, models, signature, tick, forced, nameKey]);

  return { count, countNow: () => setForced(adapter) };
}
