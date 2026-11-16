import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PropertyRow } from '../../shared/types.js';
import { forgetLeafRows, readLeafRows } from '../viewer/sharedLeafRows.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { useViewer } from '../viewer/ViewerContext.js';

export type RowsState =
  | { status: 'idle'; rows: PropertyRow[] }
  | { status: 'loading'; rows: PropertyRow[]; request: number }
  | { status: 'ready'; rows: PropertyRow[] }
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
  const reload = useCallback(() => {
    if (adapter) forgetLeafRows(adapter);
    setVersion((v) => v + 1);
  }, [adapter]);

  useEffect(() => {
    if (!adapter) {
      setState({ status: 'idle', rows: [] });
      return;
    }
    let cancelled = false;
    setState((prev) => ({
      status: 'loading',
      rows: prev.rows,
      request: version,
    }));
    readLeafRows(adapter, names).then(
      (rows) => {
        if (!cancelled) setState({ status: 'ready', rows });
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
    };
  }, [adapter, names, version]);

  return { ...state, reload };
}
