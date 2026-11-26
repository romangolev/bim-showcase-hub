import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { forgetPersonal } from '../storage.js';
import {
  ApiError,
  fetchAuthUrl,
  fetchChildren,
  fetchSession,
  postSignOut,
  subscribeUnauthorized,
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

let sessionEnded = false;
const endedListeners = new Set<() => void>();

function setSessionEnded(value: boolean) {
  if (sessionEnded === value) return;
  sessionEnded = value;
  for (const listener of [...endedListeners]) listener();
}

export function useSessionExpiry(): boolean {
  const client = useQueryClient();
  useEffect(
    () =>
      subscribeUnauthorized(() => {
        if (client.getQueryData(sessionQueryKey)) {
          setSessionEnded(true);
        }
      }),
    [client],
  );
  return useSyncExternalStore(
    (listener) => {
      endedListeners.add(listener);
      return () => {
        endedListeners.delete(listener);
      };
    },
    () => sessionEnded,
    () => false,
  );
}

export function resetSessionEnded() {
  setSessionEnded(false);
}

export function childrenQueryOptions(scope: NodeScope) {
  return queryOptions({
    queryKey: scopeKey(scope),
    queryFn: ({ signal }) => fetchChildren(scope, signal),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: (count, error) =>
      !(
        error instanceof ApiError &&
        (error.status === 429 || error.status === 403)
      ) && count < 1,
    retryDelay: 400,
  });
}

export function useSignOut() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: postSignOut,
    onSuccess: () => {
      forgetPersonal();
      client.removeQueries({ queryKey: ['children'] });
      resetSessionEnded();
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
