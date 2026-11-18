export type TaskState = 'running' | 'done' | 'warning' | 'failed' | 'cancelled';

export interface Task {
  id: number;
  label: string;
  state: TaskState;
  progress: number | null;
  detail: string | null;
  cancellable: boolean;
  retryable: boolean;
  startedAt: number;
  endedAt: number | null;
}

export interface TaskSnapshot {
  tasks: readonly Task[];
  running: number;
  announcement: string;
}

export interface TaskOptions {
  label: string;
  cancel?: () => void;
  retry?: () => void;
}

export interface TaskHandle {
  id: number;
  progress: (fraction: number | null, detail?: string) => void;
  finish: (detail?: string) => void;
  warn: (detail?: string) => void;
  fail: (error?: unknown) => void;
  cancel: () => void;
  discard: () => void;
}

export interface TaskStore {
  start: (options: TaskOptions) => TaskHandle;
  cancel: (id: number) => void;
  retry: (id: number) => void;
  dismiss: (id: number) => void;
  discard: (id: number) => void;
  clearFinished: () => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => TaskSnapshot;
}

export const HISTORY_LIMIT = 20;

function messageOf(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' && error ? error : null;
}

export function createTaskStore(now: () => number = Date.now): TaskStore {
  let nextId = 1;
  let snapshot: TaskSnapshot = { tasks: [], running: 0, announcement: '' };
  const listeners = new Set<() => void>();
  const hooks = new Map<number, Pick<TaskOptions, 'cancel' | 'retry'>>();

  const find = (id: number) => snapshot.tasks.find((task) => task.id === id);

  const commit = (tasks: readonly Task[], announcement: string) => {
    const finished = tasks.filter((task) => task.state !== 'running');
    const drop = new Set(
      finished.slice(0, Math.max(0, finished.length - HISTORY_LIMIT)),
    );
    const kept = tasks.filter((task) => !drop.has(task));
    for (const task of drop) hooks.delete(task.id);
    snapshot = {
      tasks: kept,
      running: kept.filter((task) => task.state === 'running').length,
      announcement,
    };
    for (const listener of listeners) listener();
  };

  const patch = (id: number, change: Partial<Task>, announcement: string) =>
    commit(
      snapshot.tasks.map((task) =>
        task.id === id ? { ...task, ...change } : task,
      ),
      announcement,
    );

  const settle = (
    id: number,
    state: Exclude<TaskState, 'running'>,
    detail: string | null,
    verb: string,
  ) => {
    const task = find(id);
    if (task?.state !== 'running') return;
    patch(
      id,
      {
        state,
        detail: detail ?? task.detail,
        progress: state === 'done' || state === 'warning' ? 1 : task.progress,
        endedAt: now(),
      },
      `${task.label} ${verb}`,
    );
  };

  const cancel = (id: number) => {
    if (find(id)?.state !== 'running') return;
    settle(id, 'cancelled', null, 'cancelled');
    hooks.get(id)?.cancel?.();
  };

  const remove = (id: number) => {
    hooks.delete(id);
    commit(
      snapshot.tasks.filter((entry) => entry.id !== id),
      snapshot.announcement,
    );
  };

  const discard = (id: number) => {
    const state = find(id)?.state;
    if (state === 'running' || state === 'failed') remove(id);
  };

  return {
    start({ label, cancel: onCancel, retry }) {
      const id = nextId++;
      hooks.set(id, { cancel: onCancel, retry });
      commit(
        [
          ...snapshot.tasks,
          {
            id,
            label,
            state: 'running',
            progress: null,
            detail: null,
            cancellable: Boolean(onCancel),
            retryable: Boolean(retry),
            startedAt: now(),
            endedAt: null,
          },
        ],
        '',
      );
      return {
        id,
        progress(fraction, detail) {
          const task = find(id);
          if (task?.state !== 'running') return;
          patch(
            id,
            {
              progress:
                fraction === null ? null : Math.min(1, Math.max(0, fraction)),
              detail: detail ?? task.detail,
            },
            snapshot.announcement,
          );
        },
        finish: (detail) => settle(id, 'done', detail ?? null, 'finished'),
        warn: (detail) =>
          settle(id, 'warning', detail ?? null, 'finished with warnings'),
        fail: (error) => settle(id, 'failed', messageOf(error), 'failed'),
        cancel: () => cancel(id),
        discard: () => discard(id),
      };
    },
    cancel,
    retry(id) {
      if (find(id)?.state === 'failed') hooks.get(id)?.retry?.();
    },
    dismiss(id) {
      const task = find(id);
      if (!task || task.state === 'running') return;
      remove(id);
    },
    discard,
    clearFinished() {
      for (const task of snapshot.tasks) {
        if (task.state !== 'running') hooks.delete(task.id);
      }
      commit(
        snapshot.tasks.filter((task) => task.state === 'running'),
        snapshot.announcement,
      );
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
  };
}

export const tasks = createTaskStore();

export function startTask(options: TaskOptions): TaskHandle {
  return tasks.start(options);
}
