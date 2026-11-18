# Task center

Issue #13.

## Intent

Long-running work (loading a model, exporting) reports into one place, so the user sees what is running, what failed and can cancel or retry, and a screen reader hears one announcement per outcome.

## Goals

- A small task registry: start, progress, finish, fail, cancel, with a short history of finished tasks.
- A neutral producer API that does not depend on React: `startTask({ label, cancel?, retry? })` returns a handle.
- A top-bar indicator (running count) and a popover list with progress, cancel, retry and clear.
- One polite live region for outcomes ("Loading A.rvt finished", "... failed").
- First producer: model loading in the viewer pane.

## Non-goals

- Toasts, position, duration and quiet-mode settings (the settings files are being refactored elsewhere; add later).
- Replacing the viewer's export status badge. The exports call `startTask` once the tool refactor lands.
- Persisting history across reloads.

## Approaches

1. React context provider. Needs a provider above every producer and cannot be called from tool code outside React; rejected.
2. Chosen: a module-level store (`createTaskStore`) with a default instance, read in React through `useSyncExternalStore`. Producers import `startTask`; tests create isolated stores.
3. Reuse the open-models store. Wrong domain; rejected.

## API sketch

```ts
const task = startTask({ label: 'Exporting Excel', cancel: () => abort.abort() });
task.progress(0.4, 'Reading properties');
task.finish('Exported 1,200 rows');
task.fail(error);
task.cancel();
const { tasks, running } = useTasks();
```

States: `running`, `done`, `failed`, `cancelled`. Calls on a finished task are ignored. History keeps the last 20 finished tasks.

## Export integration (deferred)

In `runOnce`, `const task = startTask({ label, cancel })` before the work, `task.progress(...)` from the status callback, `task.finish(...)` on `done`, `task.fail(error)` on `error`.
