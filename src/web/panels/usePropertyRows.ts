import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PropertyRow } from '../../shared/types.js';
import { readySignature } from '../viewer/modelSet.js';
import type { ReadProgress } from '../viewer/propertyReads.js';
import { forgetLeafRows, readLeafRows } from '../viewer/sharedLeafRows.js';
import { useModels } from '../viewer/useModels.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { useViewer } from '../viewer/ViewerContext.js';

export const HIDDEN_TITLE = 'All models are hidden';
export const HIDDEN_MESSAGE =
  'Show a model in the Models menu to see its elements here.';

export type RowsState =
  | { status: 'idle'; rows: PropertyRow[] }
  | { status: 'hidden'; rows: PropertyRow[] }
  | {
      status: 'loading';
      rows: PropertyRow[];
      request: number;
      progress: ReadProgress | null;
    }
  | { status: 'ready'; rows: PropertyRow[]; failed: string[] }
  | { status: 'error'; rows: PropertyRow[]; message: string };

export function useResolvedAdapter(
  override?: ViewerAdapter | null,
): ViewerAdapter | null {
  const fromContext = useViewer();
  return override ?? fromContext;
}

export function usePropertyRows(
  adapter: ViewerAdapter | null,
  propertyNames: readonly string[],
): RowsState & { reload: () => void } {
  const key = propertyNames.join('\u0000');
  const names = useMemo(() => (key ? key.split('\u0000') : []), [key]);
  const [state, setState] = useState<RowsState>({ status: 'idle', rows: [] });
  const [version, setVersion] = useState(0);
  const all = useModels(adapter);
  const models = readySignature(all);
  const hidden =
    !models && all.some((model) => model.status === 'ready' && !model.visible);
  const reload = useCallback(() => {
    if (adapter) forgetLeafRows(adapter);
    setVersion((v) => v + 1);
  }, [adapter]);

  useEffect(() => {
    if (!adapter || !models) {
      setState({ status: hidden ? 'hidden' : 'idle', rows: [] });
      return;
    }
    let cancelled = false;
    setState((prev) => ({
      status: 'loading',
      rows: prev.rows,
      request: version,
      progress: null,
    }));
    const controller = new AbortController();
    const onProgress = (progress: ReadProgress) => {
      if (cancelled) return;
      setState((prev) =>
        prev.status === 'loading' ? { ...prev, progress } : prev,
      );
    };
    let failed: string[] = [];
    readLeafRows(adapter, names, {
      signal: controller.signal,
      onProgress,
      onFailed: (names) => {
        failed = names;
      },
    }).then(
      (rows) => {
        if (!cancelled) setState({ status: 'ready', rows, failed });
      },
      (err: unknown) => {
        if (cancelled) return;
        setState({
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
  }, [adapter, names, models, version, hidden]);

  return { ...state, reload };
}
