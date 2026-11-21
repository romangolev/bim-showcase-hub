import { useEffect, useRef } from 'react';
import { BSH_KEYS, defineRecord, FORGET_EVENT } from '../storage.js';
import type { ModelInfo } from './modelSet.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

export const MODEL_VISIBILITY_KEY = BSH_KEYS.personal.hiddenModels;
export const MAX_HIDDEN_URNS = 200;

export const HIDDEN_MODELS = defineRecord<string[]>({
  key: MODEL_VISIBILITY_KEY,
  initial: [],
  sanitize: (raw) =>
    Array.isArray(raw)
      ? raw.filter((urn): urn is string => typeof urn === 'string')
      : [],
});

export function useModelVisibilityMemory(
  adapter: ViewerAdapter | null,
  models: readonly ModelInfo[],
): void {
  const applied = useRef<{ adapter: ViewerAdapter; urns: Set<string> } | null>(
    null,
  );
  const memory = useRef<string[] | null>(null);
  useEffect(() => {
    const forget = () => {
      memory.current = null;
    };
    window.addEventListener(FORGET_EVENT, forget);
    return () => window.removeEventListener(FORGET_EVENT, forget);
  }, []);
  useEffect(() => {
    if (!adapter || models.length < 2) {
      applied.current = null;
      return;
    }
    if (applied.current?.adapter !== adapter) {
      applied.current = { adapter, urns: new Set() };
    }
    const open = new Set(models.map((model) => model.urn));
    for (const urn of applied.current.urns) {
      if (!open.has(urn)) applied.current.urns.delete(urn);
    }
    if (models.some((model) => model.status === 'loading')) return;
    const ready = models.filter((model) => model.status === 'ready');
    if (ready.length === 0) return;
    const done = applied.current.urns;
    const stored = memory.current ?? HIDDEN_MODELS.read();
    memory.current = stored;
    const fresh = ready.filter((model) => !done.has(model.urn));
    if (fresh.length > 0) {
      for (const model of fresh) {
        done.add(model.urn);
        if (model.visible === stored.includes(model.urn)) {
          adapter.setModelVisible(model.id, !stored.includes(model.urn));
        }
      }
      return;
    }
    const hidden = [
      ...new Set(
        ready.filter((model) => !model.visible).map((model) => model.urn),
      ),
    ];
    const present = new Set(ready.map((model) => model.urn));
    const next = [
      ...stored.filter((urn) => !present.has(urn)),
      ...hidden,
    ].slice(-MAX_HIDDEN_URNS);
    if (JSON.stringify(next) === JSON.stringify(stored)) return;
    memory.current = next;
    HIDDEN_MODELS.write(next);
  }, [adapter, models]);
}
