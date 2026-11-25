import { useQueryClient } from '@tanstack/react-query';
import { useState, useSyncExternalStore } from 'react';
import type { DeepSearchView } from './deepSearch.js';
import { queryTreeData } from './treeData.js';
import {
  createTreeState,
  type TreeSnapshot,
  type TreeState,
  type TreeStateOptions,
} from './treeState.js';

export function useTreeState(
  options: Pick<TreeStateOptions, 'root' | 'sort'>,
): {
  state: TreeState;
  snapshot: TreeSnapshot;
  search: DeepSearchView | null;
} {
  const client = useQueryClient();
  const [state] = useState(() =>
    createTreeState({ ...options, data: queryTreeData(client) }),
  );
  const snapshot = useSyncExternalStore(
    state.subscribe,
    state.getSnapshot,
    state.getSnapshot,
  );
  const search = useSyncExternalStore(
    state.deepSearch.subscribe,
    state.deepSearch.getSnapshot,
    state.deepSearch.getSnapshot,
  );
  return { state, snapshot, search };
}
