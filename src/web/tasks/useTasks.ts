import { useSyncExternalStore } from 'react';
import { type TaskSnapshot, type TaskStore, tasks } from './taskStore.js';

export type TaskCenterState = TaskSnapshot &
  Pick<TaskStore, 'cancel' | 'retry' | 'dismiss' | 'clearFinished'>;

export function useTasks(store: TaskStore = tasks): TaskCenterState {
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  return {
    ...snapshot,
    cancel: store.cancel,
    retry: store.retry,
    dismiss: store.dismiss,
    clearFinished: store.clearFinished,
  };
}
