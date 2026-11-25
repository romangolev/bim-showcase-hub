import { ApiError } from '../../api/client.js';
import { friendlyError } from '../../api/friendlyError.js';
import { startTask, type TaskHandle } from '../../tasks/taskStore.js';
import { CRAWL_LIMITS, type CrawlProgress, type CrawlResult } from './crawl.js';

export interface DeepSearchView {
  status: 'running' | 'done' | 'warning' | 'cancelled';
  folders: number;
  nodes: number;
  failed: number;
  detail: string | null;
}

export interface DeepSearch {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => DeepSearchView | null;
  start: () => void;
  cancel: () => void;
  dispose: () => void;
}

export interface DeepSearchOptions {
  canStart: () => boolean;
  crawl: (
    signal: AbortSignal,
    onProgress: (progress: CrawlProgress) => void,
  ) => Promise<CrawlResult>;
}

const PROGRESS_INTERVAL_MS = 250;

export function warningText(result: CrawlResult): string | null {
  if (result.stop === 'unauthorized') {
    return friendlyError(new ApiError(401, 'Unauthorized')).message;
  }
  const parts: string[] = [];
  if (result.stop === 'folders') {
    parts.push(
      `Stopped at the ${CRAWL_LIMITS.maxFolders} folder limit. Narrow the search to a folder.`,
    );
  } else if (result.stop === 'time' || result.stop === 'nodes') {
    parts.push(
      'Stopped before every folder was read. Narrow the search to a folder.',
    );
  }
  if (result.failed > 0) {
    parts.push(
      `${result.failed} folder${result.failed === 1 ? '' : 's'} could not be read`,
    );
  }
  return parts.length > 0 ? parts.join('. ') : null;
}

export function createDeepSearch({
  canStart,
  crawl,
}: DeepSearchOptions): DeepSearch {
  const listeners = new Set<() => void>();
  let view: DeepSearchView | null = null;
  let controller: AbortController | null = null;
  let task: TaskHandle | null = null;
  let run = 0;

  const set = (next: DeepSearchView | null) => {
    view = next;
    for (const listener of listeners) listener();
  };

  const stop = (): TaskHandle | null => {
    run += 1;
    controller?.abort();
    controller = null;
    const stopped = task;
    task = null;
    return stopped;
  };

  const finish = (result: CrawlResult, handle: TaskHandle) => {
    const base = {
      folders: result.folders,
      nodes: result.nodes,
      failed: result.failed,
    };
    if (result.stop === 'cancelled') {
      set({ status: 'cancelled', ...base, detail: null });
      handle.cancel();
      return;
    }
    const warning = warningText(result);
    if (warning) {
      set({ status: 'warning', ...base, detail: warning });
      handle.warn(warning);
      return;
    }
    set({ status: 'done', ...base, detail: null });
    handle.finish(`Searched ${result.folders} folders`);
  };

  const cancel = () => {
    if (!controller) return;
    const stopped = stop();
    set({
      status: 'cancelled',
      folders: view?.folders ?? 0,
      nodes: view?.nodes ?? 0,
      failed: view?.failed ?? 0,
      detail: null,
    });
    stopped?.cancel();
  };

  const start = () => {
    if (controller || !canStart()) return;
    const mine = new AbortController();
    controller = mine;
    const id = run + 1;
    run = id;
    set({ status: 'running', folders: 0, nodes: 0, failed: 0, detail: null });
    let lastProgress = 0;
    const handle = startTask({ label: 'Searching project files', cancel });
    task = handle;
    void crawl(mine.signal, (progress) => {
      if (id !== run) return;
      const at = Date.now();
      if (at - lastProgress < PROGRESS_INTERVAL_MS) return;
      lastProgress = at;
      set({
        status: 'running',
        folders: progress.folders,
        nodes: progress.nodes,
        failed: progress.failed,
        detail: null,
      });
      handle.progress(
        null,
        `Searched ${progress.folders} folders, ${progress.nodes} files and folders found`,
      );
    })
      .then((result) => {
        if (id !== run) return;
        controller = null;
        task = null;
        finish(result, handle);
      })
      .catch((error: unknown) => {
        if (id !== run) return;
        controller = null;
        task = null;
        set(
          view
            ? {
                ...view,
                status: 'warning',
                detail: 'The search stopped before it finished.',
              }
            : null,
        );
        handle.fail(error);
      });
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => view,
    start,
    cancel,
    dispose: () => {
      stop()?.discard();
      set(null);
    },
  };
}
