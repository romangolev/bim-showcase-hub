import type { QueryClient } from '@tanstack/react-query';
import { fetchVersionViewState } from '../../api/client.js';
import { childrenQueryOptions } from '../../api/hooks.js';
import { scopeKey } from '../../api/scope.js';
import type { TreeData } from './treeState.js';

export function queryTreeData(client: QueryClient): TreeData {
  return {
    children: (scope) => client.fetchQuery(childrenQueryOptions(scope)),
    forget: (scope) =>
      client.removeQueries({ queryKey: scopeKey(scope), exact: true }),
    viewState: fetchVersionViewState,
  };
}
