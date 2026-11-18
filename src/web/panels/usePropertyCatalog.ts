import { useCallback, useEffect, useState } from 'react';
import { readySignature } from '../viewer/modelSet.js';
import type { PropertyInfo } from '../viewer/propertyReads.js';
import {
  discoverLeafProperties,
  forgetLeafRows,
} from '../viewer/sharedLeafRows.js';
import { useModels } from '../viewer/useModels.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';

export type CatalogState =
  | { status: 'idle'; catalog: PropertyInfo[] }
  | { status: 'loading'; catalog: PropertyInfo[] }
  | { status: 'ready'; catalog: PropertyInfo[] }
  | { status: 'error'; catalog: PropertyInfo[]; message: string };

export function usePropertyCatalog(
  adapter: ViewerAdapter | null,
): CatalogState & { reload: () => void } {
  const [state, setState] = useState<CatalogState>({
    status: 'idle',
    catalog: [],
  });
  const [version, setVersion] = useState(0);
  const models = readySignature(useModels(adapter));
  const reload = useCallback(() => {
    if (adapter) forgetLeafRows(adapter);
    setVersion((v) => v + 1);
  }, [adapter]);

  useEffect(() => {
    if (!adapter || !models) {
      setState({ status: 'idle', catalog: [] });
      return;
    }
    const controller = new AbortController();
    setState((prev) => ({ status: 'loading', catalog: prev.catalog }));
    discoverLeafProperties(adapter, { signal: controller.signal }).then(
      (catalog) => {
        if (!controller.signal.aborted) setState({ status: 'ready', catalog });
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          catalog: [],
          message:
            err instanceof Error ? err.message : 'Could not read properties',
        });
      },
    );
    return () => controller.abort();
  }, [adapter, models, version]);

  return { ...state, reload };
}
