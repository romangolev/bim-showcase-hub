import { useEffect, useState } from 'react';
import { ALL_MODELS, type ModelScope, resolveScope } from './modelScope.js';
import {
  applyScope,
  type ElementScope,
  resolveElementScope,
  scopeElementItems,
} from './propertyScope.js';
import { useSelectionSets } from './selectionSets.js';
import { peekLeafRows } from './sharedLeafRows.js';
import { useModels } from './useModels.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

export const COUNT_RECHECK_MS = 1000;

export async function countScopedRows(
  adapter: ViewerAdapter,
  scope: { models?: ModelScope; elements?: ElementScope },
): Promise<number | null> {
  const models = adapter.getModels();
  const model = resolveScope(scope.models ?? ALL_MODELS, models);
  const rows = peekLeafRows(
    adapter,
    model === ALL_MODELS ? undefined : [model],
  );
  if (!rows) return null;
  const elements = resolveElementScope(scope.elements ?? 'all');
  const items = await scopeElementItems(adapter, elements);
  return applyScope(rows, { elements }, items, models[0]?.id).length;
}

export function useScopeCount(
  adapter: ViewerAdapter | null,
  scope: { models?: ModelScope; elements?: ElementScope },
): number | null {
  const [count, setCount] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const models = useModels(adapter);
  const sets = useSelectionSets();
  const signature = `${models.map((m) => `${m.id}:${m.status}:${m.visible}`).join()}|${sets.length}`;
  const elements = scope.elements ?? 'all';
  const modelScope = scope.models ?? ALL_MODELS;

  useEffect(() => {
    if (!adapter) {
      setCount(null);
      return;
    }
    let live = true;
    countScopedRows(adapter, { models: modelScope, elements }).then(
      (next) => {
        if (live) setCount(next);
      },
      () => {
        if (live) setCount(null);
      },
    );
    const off = adapter.onSelectionChange(() => setTick((n) => n + 1));
    return () => {
      live = false;
      off();
    };
  }, [adapter, elements, modelScope, signature, tick]);

  useEffect(() => {
    if (!adapter || count !== null) return;
    const timer = setInterval(() => setTick((n) => n + 1), COUNT_RECHECK_MS);
    return () => clearInterval(timer);
  }, [adapter, count]);

  return count;
}
