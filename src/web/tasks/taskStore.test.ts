import { describe, expect, it, vi } from 'vitest';
import { createTaskStore, HISTORY_LIMIT } from './taskStore.js';

describe('task store', () => {
  it('tracks a task from start to finish with progress', () => {
    const store = createTaskStore(() => 5);
    const listener = vi.fn();
    store.subscribe(listener);
    const task = store.start({ label: 'Export' });
    expect(store.getSnapshot().running).toBe(1);
    task.progress(2, 'Reading');
    expect(store.getSnapshot().tasks[0]).toMatchObject({
      progress: 1,
      detail: 'Reading',
    });
    task.progress(null);
    expect(store.getSnapshot().tasks[0]?.progress).toBeNull();
    task.finish('Done');
    expect(store.getSnapshot().tasks[0]).toMatchObject({
      state: 'done',
      progress: 1,
      detail: 'Done',
      endedAt: 5,
    });
    expect(store.getSnapshot()).toMatchObject({
      running: 0,
      announcement: 'Export finished',
    });
    expect(listener).toHaveBeenCalled();
  });

  it('ignores calls on a settled task', () => {
    const store = createTaskStore();
    const task = store.start({ label: 'A' });
    task.fail(new Error('boom'));
    task.finish();
    task.cancel();
    task.progress(0.5);
    expect(store.getSnapshot().tasks[0]).toMatchObject({
      state: 'failed',
      detail: 'boom',
    });
    expect(store.getSnapshot().announcement).toBe('A failed');
  });

  it('settles a task with a warning once', () => {
    const store = createTaskStore();
    const task = store.start({ label: 'A' });
    task.warn('Skipped 2');
    task.finish();
    task.fail(new Error('late'));
    expect(store.getSnapshot().tasks[0]).toMatchObject({
      state: 'warning',
      progress: 1,
      detail: 'Skipped 2',
    });
    expect(store.getSnapshot().announcement).toBe('A finished with warnings');
    store.retry(task.id);
    expect(store.getSnapshot().running).toBe(0);
  });

  it('discards running and failed tasks without a trace but keeps finished ones', () => {
    const store = createTaskStore();
    const running = store.start({ label: 'A' });
    const failed = store.start({ label: 'B' });
    failed.fail('x');
    const done = store.start({ label: 'C' });
    done.finish();
    running.discard();
    failed.discard();
    done.discard();
    expect(store.getSnapshot().tasks.map((task) => task.label)).toEqual(['C']);
    expect(store.getSnapshot().running).toBe(0);
    running.finish();
    expect(store.getSnapshot().tasks).toHaveLength(1);
  });

  it('cancels through the producer hook once', () => {
    const store = createTaskStore();
    const cancel = vi.fn();
    const task = store.start({ label: 'A', cancel });
    expect(store.getSnapshot().tasks[0]?.cancellable).toBe(true);
    store.cancel(task.id);
    store.cancel(task.id);
    task.cancel();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().tasks[0]?.state).toBe('cancelled');
    expect(store.getSnapshot().announcement).toBe('A cancelled');
  });

  it('retries only failed tasks', () => {
    const store = createTaskStore();
    const retry = vi.fn();
    const task = store.start({ label: 'A', retry });
    store.retry(task.id);
    expect(retry).not.toHaveBeenCalled();
    task.fail();
    store.retry(task.id);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('dismisses and clears finished tasks but never running ones', () => {
    const store = createTaskStore();
    const a = store.start({ label: 'A' });
    const b = store.start({ label: 'B' });
    store.start({ label: 'C' });
    a.finish();
    store.dismiss(b.id);
    expect(store.getSnapshot().tasks.map((task) => task.label)).toEqual([
      'A',
      'B',
      'C',
    ]);
    store.dismiss(a.id);
    b.fail();
    store.clearFinished();
    expect(store.getSnapshot().tasks.map((task) => task.label)).toEqual(['C']);
  });

  it('keeps a bounded history of finished tasks', () => {
    const store = createTaskStore();
    for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) {
      store.start({ label: `T${i}` }).finish();
    }
    const live = store.start({ label: 'live' });
    const { tasks } = store.getSnapshot();
    expect(tasks).toHaveLength(HISTORY_LIMIT + 1);
    expect(tasks[0]?.label).toBe('T5');
    expect(tasks.at(-1)?.id).toBe(live.id);
  });
});
