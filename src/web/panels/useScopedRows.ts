import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PropertyRow } from '../../shared/types.js';
import {
  ALL_MODELS,
  type ModelScope,
  type ModelScopeOption,
  modelScopeOptions,
  resolveScope,
  unavailableModels,
} from '../viewer/modelScope.js';
import type { ModelDbId, ModelInfo } from '../viewer/modelSet.js';
import { readySignature } from '../viewer/modelSet.js';
import type { ReadProgress } from '../viewer/propertyReads.js';
import {
  applyScope,
  type ElementScope,
  resolveElementScope,
  scopeNoteFor,
} from '../viewer/propertyScope.js';
import { readScopedRows } from '../viewer/scopedRows.js';
import { useSelectionSets } from '../viewer/selectionSets.js';
import { scopeElementItems } from '../viewer/setResolution.js';
import { forgetLeafRows } from '../viewer/sharedLeafRows.js';
import { useModels } from '../viewer/useModels.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { useViewer } from '../viewer/ViewerContext.js';

export const HIDDEN_TITLE = 'All models are hidden';
export const HIDDEN_MESSAGE =
  'Show a model in the Models menu to see its elements here.';
export const SELECTION_DEBOUNCE_MS = 150;

type ReadStatus =
  | { status: 'idle' }
  | { status: 'hidden' }
  | { status: 'loading'; progress: ReadProgress | null }
  | { status: 'ready'; failed: string[] }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export interface ModelScopeControl {
  options: ModelScopeOption[];
  scope: ModelScope;
  setScope: (scope: ModelScope) => void;
  unavailable: ModelInfo[];
}

export interface ScopedRowsRequest {
  names: readonly string[];
  elements?: ElementScope;
  models?: { value: ModelScope; onChange: (scope: ModelScope) => void };
}

export type ScopedRows = ReadStatus & {
  rows: PropertyRow[];
  total: number;
  pending: boolean;
  elements: ElementScope;
  scopeNote?: string;
  models: ModelScopeControl;
  reload: () => void;
  cancel: () => void;
};

export function useResolvedAdapter(
  override?: ViewerAdapter | null,
): ViewerAdapter | null {
  const fromContext = useViewer();
  return override ?? fromContext;
}

const EMPTY_ITEMS: ModelDbId[] = [];

function useElementItems(
  adapter: ViewerAdapter | null,
  elements: ElementScope,
  signature: string,
  version: number,
): { items: ModelDbId[]; pending: boolean } {
  const [loaded, setLoaded] = useState<{
    key: string;
    list: ModelDbId[];
  } | null>(null);
  const key = `${elements}|${signature}|${version}`;

  useEffect(() => {
    if (!adapter || elements === 'all') return;
    let live = true;
    let latest = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      const token = ++latest;
      scopeElementItems(adapter, elements).then(
        (list) => {
          if (live && token === latest) setLoaded({ key, list });
        },
        () => {
          if (live && token === latest) setLoaded({ key, list: [] });
        },
      );
    };
    const delayed = (apply: () => void) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (live) apply();
      }, SELECTION_DEBOUNCE_MS);
    };
    load();
    const off =
      elements === 'selected'
        ? adapter.onSelectionChange((list) => {
            latest++;
            delayed(() => setLoaded({ key, list }));
          })
        : elements === 'visible' || elements === 'isolated'
          ? adapter.onVisibilityChange(() => {
              latest++;
              delayed(load);
            })
          : undefined;
    return () => {
      live = false;
      clearTimeout(timer);
      off?.();
    };
  }, [adapter, elements, key]);

  const current = elements === 'all' || loaded?.key === key;
  const list = current && loaded ? loaded.list : EMPTY_ITEMS;
  return useMemo(() => ({ items: list, pending: !current }), [list, current]);
}

export function useScopedRows(
  adapter: ViewerAdapter | null,
  {
    names: nameList,
    elements: requested = 'all',
    models: controlled,
  }: ScopedRowsRequest,
): ScopedRows {
  useSelectionSets();
  const elements = resolveElementScope(requested);
  const scopeNote = scopeNoteFor(requested);
  const key = nameList.join('\u0000');
  const names = useMemo(() => (key ? key.split('\u0000') : []), [key]);
  const [read, setRead] = useState<ReadStatus & { rows: PropertyRow[] }>({
    status: 'idle',
    rows: [],
  });
  const [version, setVersion] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const all = useModels(adapter);
  const signature = readySignature(all);
  const hidden =
    !signature && all.some((m) => m.status === 'ready' && !m.visible);
  const reload = useCallback(() => {
    if (adapter) forgetLeafRows(adapter);
    setVersion((v) => v + 1);
  }, [adapter]);

  useEffect(() => {
    if (!adapter || !signature) {
      setRead({ status: hidden ? 'hidden' : 'idle', rows: [] });
      return;
    }
    let cancelled = false;
    setRead((prev) => ({ status: 'loading', rows: prev.rows, progress: null }));
    const controller = new AbortController();
    controllerRef.current = controller;
    const onProgress = (progress: ReadProgress) => {
      if (cancelled) return;
      setRead((prev) =>
        prev.status === 'loading' ? { ...prev, progress } : prev,
      );
    };
    readScopedRows(adapter, {
      names,
      elements: 'all',
      signal: controller.signal,
      onProgress,
    }).then(
      (result) => {
        if (!cancelled && !controller.signal.aborted)
          setRead({
            status: 'ready',
            rows: result.rows,
            failed: result.failed,
          });
      },
      (err: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        setRead({
          status: 'error',
          rows: [],
          message:
            err instanceof Error ? err.message : 'Could not read properties',
        });
      },
    );
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [adapter, names, signature, version, hidden]);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    setRead((prev) =>
      prev.status === 'loading'
        ? { status: 'cancelled', rows: prev.rows }
        : prev,
    );
  }, []);

  const [inner, setInner] = useState<ModelScope>(ALL_MODELS);
  const options = useMemo(() => modelScopeOptions(all), [all]);
  const chosen = controlled?.value ?? inner;
  const scope = options.length > 0 ? resolveScope(chosen, all) : ALL_MODELS;
  const unavailable = useMemo(() => unavailableModels(all), [all]);
  const items = useElementItems(adapter, elements, signature, version);
  const primaryId = all[0]?.id;

  const modelRows = useMemo(
    () => applyScope(read.rows, { models: scope }, [], primaryId),
    [read.rows, scope, primaryId],
  );
  const rows = useMemo(
    () =>
      items.pending
        ? []
        : applyScope(modelRows, { elements }, items.items, primaryId),
    [modelRows, elements, items, primaryId],
  );

  const { rows: _unscoped, ...status } = read;
  return {
    ...status,
    rows,
    total: modelRows.length,
    pending: items.pending,
    elements,
    ...(scopeNote ? { scopeNote } : {}),
    models: {
      options,
      scope,
      setScope: controlled?.onChange ?? setInner,
      unavailable,
    },
    reload,
    cancel,
  };
}
