import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  fetchAuthUrl,
  fetchChildren,
  fetchSession,
  postSignOut,
} from './client.js';
import { type NodeScope, scopeKey } from './scope.js';

export const sessionQueryKey = ['session'] as const;

export const sessionQueryOptions = queryOptions({
  queryKey: sessionQueryKey,
  queryFn: ({ signal }) => fetchSession(signal),
  staleTime: 5 * 60_000,
  retry: false,
});

export function useSession() {
  return useQuery(sessionQueryOptions);
}

export function childrenQueryOptions(scope: NodeScope) {
  return queryOptions({
    queryKey: scopeKey(scope),
    queryFn: ({ signal }) => fetchChildren(scope, signal),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
    retryDelay: 400,
  });
}

export function useNodeChildren(scope: NodeScope, enabled = true) {
  return useQuery({ ...childrenQueryOptions(scope), enabled });
}

export function useSignOut() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: postSignOut,
    onSuccess: () => {
      client.removeQueries({ queryKey: ['children'] });
      client.setQueryData(sessionQueryKey, null);
    },
  });
}

export function useSignIn() {
  return useMutation({
    mutationFn: fetchAuthUrl,
    onSuccess: (url) => {
      window.location.assign(url);
    },
  });
}
