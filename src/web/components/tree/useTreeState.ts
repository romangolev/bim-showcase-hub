import { useQueryClient } from '@tanstack/react-query';
import { useState, useSyncExternalStore } from 'react';
import { queryTreeData } from './treeData.js';
import {
  createTreeState,
  type TreeSnapshot,
  type TreeState,
  type TreeStateOptions,
} from './treeState.js';

export function useTreeState(
  options: Pick<TreeStateOptions, 'root' | 'sort'>,
): { state: TreeState; snapshot: TreeSnapshot } {
  const client = useQueryClient();
  const [state] = useState(() =>
    createTreeState({ ...options, data: queryTreeData(client) }),
  );
  const snapshot = useSyncExternalStore(
    state.subscribe,
    state.getSnapshot,
    state.getSnapshot,
  );
  return { state, snapshot };
}
