import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tasks } from '../../tasks/taskStore.js';
import { CRAWL_LIMITS, type CrawlResult } from './crawl.js';
import { createDeepSearch, warningText } from './deepSearch.js';

function result(extra: Partial<CrawlResult> = {}): CrawlResult {
  return {
    stop: 'done',
    folders: 3,
    queued: 0,
    nodes: 7,
    failed: 0,
    failedIds: [],
    ...extra,
  };
}

function deferred() {
  const runs: {
    signal: AbortSignal;
    progress: (folders: number, nodes: number) => void;
    settle: (value: CrawlResult) => void;
    fail: (error: unknown) => void;
  }[] = [];
  const crawl = vi.fn(
    (signal: AbortSignal, onProgress: (p: never) => void) =>
      new Promise<CrawlResult>((resolve, reject) => {
        runs.push({
          signal,
          progress: (folders, nodes) =>
            (onProgress as (p: unknown) => void)({
              folders,
              nodes,
              queued: 0,
              failed: 0,
            }),
          settle: resolve,
          fail: reject,
        });
      }),
  );
  return { runs, crawl };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const lastTask = () => tasks.getSnapshot().tasks.at(-1);

beforeEach(() => {
  tasks.clearFinished();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('deepSearch session', () => {
  it('runs, reports progress and finishes with the task', async () => {
    const { runs, crawl } = deferred();
    const search = createDeepSearch({ canStart: () => true, crawl });
    search.start();
    expect(search.getSnapshot()).toEqual({
      status: 'running',
      folders: 0,
      nodes: 0,
      failed: 0,
      detail: null,
    });
    expect(lastTask()?.label).toBe('Searching project files');
    runs[0]?.progress(2, 5);
    expect(search.getSnapshot()?.folders).toBe(2);
    expect(lastTask()?.detail).toBe(
      'Searched 2 folders, 5 files and folders found',
    );
    runs[0]?.settle(result());
    await flush();
    expect(search.getSnapshot()).toMatchObject({
      status: 'done',
      folders: 3,
      detail: null,
    });
    expect(lastTask()).toMatchObject({
      state: 'done',
      detail: 'Searched 3 folders',
    });
  });

  it('throttles progress to one update per interval', () => {
    vi.useFakeTimers();
    const { runs, crawl } = deferred();
    const search = createDeepSearch({ canStart: () => true, crawl });
    search.start();
    runs[0]?.progress(1, 1);
    runs[0]?.progress(2, 2);
    expect(search.getSnapshot()?.folders).toBe(1);
    vi.advanceTimersByTime(250);
    runs[0]?.progress(3, 3);
    expect(search.getSnapshot()?.folders).toBe(3);
  });

  it('does nothing when it cannot start or one is already running', () => {
    const { crawl } = deferred();
    const blocked = createDeepSearch({ canStart: () => false, crawl });
    blocked.start();
    expect(crawl).not.toHaveBeenCalled();
    expect(blocked.getSnapshot()).toBeNull();
    const search = createDeepSearch({ canStart: () => true, crawl });
    search.start();
    search.start();
    expect(crawl).toHaveBeenCalledTimes(1);
  });

  it('cancels with the counts so far, aborts and cancels the task', () => {
    const { runs, crawl } = deferred();
    const search = createDeepSearch({ canStart: () => true, crawl });
    search.start();
    runs[0]?.progress(2, 5);
    search.cancel();
    expect(runs[0]?.signal.aborted).toBe(true);
    expect(search.getSnapshot()).toEqual({
      status: 'cancelled',
      folders: 2,
      nodes: 5,
      failed: 0,
      detail: null,
    });
    expect(lastTask()?.state).toBe('cancelled');
    search.cancel();
    expect(lastTask()?.state).toBe('cancelled');
  });

  it('cancels from the Task Center and settles once', () => {
    const { runs, crawl } = deferred();
    const search = createDeepSearch({ canStart: () => true, crawl });
    search.start();
    const id = lastTask()?.id;
    if (id === undefined) throw new Error('task missing');
    tasks.cancel(id);
    expect(runs[0]?.signal.aborted).toBe(true);
    expect(search.getSnapshot()?.status).toBe('cancelled');
    expect(lastTask()?.state).toBe('cancelled');
  });

  it('ignores a cancelled run that settles after a restart', async () => {
    const { runs, crawl } = deferred();
    const search = createDeepSearch({ canStart: () => true, crawl });
    search.start();
    search.cancel();
    search.start();
    expect(runs).toHaveLength(2);
    runs[0]?.settle(result({ stop: 'cancelled', folders: 1 }));
    await flush();
    expect(search.getSnapshot()?.status).toBe('running');
    const [first, second] = tasks.getSnapshot().tasks.slice(-2);
    expect(first?.state).toBe('cancelled');
    expect(second?.state).toBe('running');
    runs[1]?.settle(result());
    await flush();
    expect(search.getSnapshot()?.status).toBe('done');
    expect(lastTask()?.state).toBe('done');
  });

  it('ignores progress from a cancelled run', () => {
    const { runs, crawl } = deferred();
    const search = createDeepSearch({ canStart: () => true, crawl });
    search.start();
    search.cancel();
    runs[0]?.progress(9, 9);
    expect(search.getSnapshot()?.folders).toBe(0);
  });

  it('warns with the folder limit and the failed folders', async () => {
    const { runs, crawl } = deferred();
    const search = createDeepSearch({ canStart: () => true, crawl });
    search.start();
    runs[0]?.settle(result({ stop: 'folders', failed: 2 }));
    await flush();
    const detail = `Stopped at the ${CRAWL_LIMITS.maxFolders} folder limit. Narrow the search to a folder.. 2 folders could not be read`;
    expect(search.getSnapshot()).toMatchObject({ status: 'warning', detail });
    expect(lastTask()).toMatchObject({ state: 'warning', detail });
  });

  it('tells the user to sign in when the session expires', async () => {
    const { runs, crawl } = deferred();
    const search = createDeepSearch({ canStart: () => true, crawl });
    search.start();
    runs[0]?.settle(result({ stop: 'unauthorized' }));
    await flush();
    expect(search.getSnapshot()?.detail).toBe(
      'Your session has expired. Sign in again to continue.',
    );
  });

  it('fails the task and keeps the counts when the crawl rejects', async () => {
    const { runs, crawl } = deferred();
    const search = createDeepSearch({ canStart: () => true, crawl });
    search.start();
    runs[0]?.fail(new Error('boom'));
    await flush();
    expect(search.getSnapshot()).toMatchObject({
      status: 'warning',
      detail: 'The search stopped before it finished.',
    });
    expect(lastTask()).toMatchObject({ state: 'failed', detail: 'boom' });
  });

  it('disposes a running search: aborts, drops the task, ignores a late result', async () => {
    const { runs, crawl } = deferred();
    const search = createDeepSearch({ canStart: () => true, crawl });
    const before = tasks.getSnapshot().tasks.length;
    search.start();
    search.dispose();
    expect(runs[0]?.signal.aborted).toBe(true);
    expect(search.getSnapshot()).toBeNull();
    expect(tasks.getSnapshot().tasks).toHaveLength(before);
    runs[0]?.settle(result());
    await flush();
    expect(search.getSnapshot()).toBeNull();
  });

  it('notifies subscribers and stops after unsubscribe', () => {
    const { crawl } = deferred();
    const search = createDeepSearch({ canStart: () => true, crawl });
    const listener = vi.fn();
    const off = search.subscribe(listener);
    search.start();
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    search.cancel();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('warningText', () => {
  it('is null for a clean finish', () => {
    expect(warningText(result())).toBeNull();
  });

  it('explains a time or node stop and singular failures', () => {
    expect(warningText(result({ stop: 'time', failed: 1 }))).toBe(
      'Stopped before every folder was read. Narrow the search to a folder.. 1 folder could not be read',
    );
  });
});
