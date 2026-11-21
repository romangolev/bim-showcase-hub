import type { QueryClient } from '@tanstack/react-query';
import { fetchChildren, fetchVersionViewState } from '../../api/client.js';
import { childrenQueryOptions } from '../../api/hooks.js';
import { scopeKey } from '../../api/scope.js';
import type { TreeData } from './treeState.js';

export function queryTreeData(client: QueryClient): TreeData {
  return {
    children: (scope, signal) =>
      signal
        ? fetchChildren(scope, signal).then((nodes) => {
            client.setQueryData(scopeKey(scope), nodes);
            return nodes;
          })
        : client.fetchQuery(childrenQueryOptions(scope)),
    forget: (scope) =>
      client.removeQueries({ queryKey: scopeKey(scope), exact: true }),
    viewState: fetchVersionViewState,
  };
}
