import { useEffect, useRef } from 'react';
import type { ModelInfo } from './modelSet.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

export const MODEL_VISIBILITY_KEY = 'bsh.models.hidden';
const MAX_SETS = 20;

type Memory = Record<string, string[]>;

function read(): Memory {
  try {
    const raw = JSON.parse(
      window.localStorage.getItem(MODEL_VISIBILITY_KEY) ?? '{}',
    );
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(raw).filter(
        (entry): entry is [string, string[]] =>
          Array.isArray(entry[1]) &&
          entry[1].every((value) => typeof value === 'string'),
      ),
    );
  } catch {
    return {};
  }
}

function write(key: string, hidden: string[]): void {
  const memory = read();
  if (JSON.stringify(memory[key] ?? []) === JSON.stringify(hidden)) return;
  delete memory[key];
  if (hidden.length > 0) memory[key] = hidden;
  const kept = Object.fromEntries(Object.entries(memory).slice(-MAX_SETS));
  try {
    window.localStorage.setItem(MODEL_VISIBILITY_KEY, JSON.stringify(kept));
  } catch {
    return;
  }
}

export function useModelVisibilityMemory(
  adapter: ViewerAdapter | null,
  models: readonly ModelInfo[],
): void {
  const restored = useRef<{ adapter: ViewerAdapter; key: string } | null>(null);
  useEffect(() => {
    if (!adapter || models.length < 2) return;
    if (models.some((model) => model.status === 'loading')) return;
    if (!models.some((model) => model.status === 'ready')) return;
    const key = models
      .map((model) => model.urn)
      .sort()
      .join('\n');
    const done = restored.current;
    if (!done || done.adapter !== adapter || done.key !== key) {
      restored.current = { adapter, key };
      const hidden = new Set(read()[key] ?? []);
      for (const model of models) {
        if (
          model.status === 'ready' &&
          model.visible === hidden.has(model.urn)
        ) {
          adapter.setModelVisible(model.id, !hidden.has(model.urn));
        }
      }
      return;
    }
    write(
      key,
      models
        .filter((model) => model.status === 'ready' && !model.visible)
        .map((model) => model.urn),
    );
  }, [adapter, models]);
}
