import type { TreeNode } from '../../../shared/types.js';
import { ApiError } from '../../api/client.js';

export interface CrawlLimits {
  maxFolders: number;
  maxNodes: number;
  concurrency: number;
  budgetMs: number;
  maxRetries: number;
}

export const CRAWL_LIMITS: CrawlLimits = {
  maxFolders: 400,
  maxNodes: 10_000,
  concurrency: 3,
  budgetMs: 90_000,
  maxRetries: 3,
};

const MAX_WAIT_MS = 30_000;

export type CrawlStop =
  | 'done'
  | 'folders'
  | 'nodes'
  | 'time'
  | 'cancelled'
  | 'unauthorized';

export interface CrawlProgress {
  folders: number;
  queued: number;
  nodes: number;
  failed: number;
}

export interface CrawlResult extends CrawlProgress {
  stop: CrawlStop;
  failedIds: string[];
}

export interface CrawlOptions {
  start: readonly string[];
  children: (id: string, signal: AbortSignal) => Promise<TreeNode[]>;
  signal: AbortSignal;
  limits?: Partial<CrawlLimits>;
  onProgress?: (progress: CrawlProgress) => void;
  now?: () => number;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export function retryDelayMs(error: unknown, attempt: number): number | null {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return Math.min(error.retryAfterMs ?? 1000 * 2 ** attempt, MAX_WAIT_MS);
    }
    if (error.status === 502 || error.status === 503) {
      return Math.min(1000 * 2 ** attempt, MAX_WAIT_MS);
    }
    return null;
  }
  return error instanceof TypeError
    ? Math.min(1000 * 2 ** attempt, MAX_WAIT_MS)
    : null;
}

function sleepFor(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export async function crawl(options: CrawlOptions): Promise<CrawlResult> {
  const limits = { ...CRAWL_LIMITS, ...options.limits };
  const now = options.now ?? Date.now;
  const wait = options.wait ?? sleepFor;
  const { signal } = options;
  const started = now();
  const queue = [...options.start];
  const failedIds: string[] = [];
  let folders = 0;
  let nodes = 0;
  let pausedUntil = 0;
  let stop: CrawlStop | null = null;

  const report = () =>
    options.onProgress?.({
      folders,
      queued: queue.length,
      nodes,
      failed: failedIds.length,
    });

  const limitHit = (): CrawlStop | null => {
    if (signal.aborted) return 'cancelled';
    if (now() - started > limits.budgetMs) return 'time';
    if (folders >= limits.maxFolders) return 'folders';
    if (nodes >= limits.maxNodes) return 'nodes';
    return null;
  };

  const visit = async (id: string) => {
    for (let attempt = 0; ; attempt += 1) {
      const pause = pausedUntil - now();
      if (pause > 0) await wait(pause, signal);
      if (signal.aborted) return;
      try {
        const found = await options.children(id, signal);
        if (signal.aborted) return;
        nodes += found.length;
        for (const node of found) {
          if (node.kind === 'folder') queue.push(node.id);
        }
        return;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          stop = 'unauthorized';
          return;
        }
        const delay = retryDelayMs(error, attempt);
        if (delay === null || attempt >= limits.maxRetries) {
          failedIds.push(id);
          return;
        }
        if (error instanceof ApiError && error.status === 429) {
          pausedUntil = now() + delay;
        }
        await wait(delay, signal);
      }
    }
  };

  const worker = async () => {
    while (stop === null) {
      const hit = limitHit();
      if (hit) {
        stop = hit;
        return;
      }
      const id = queue.shift();
      if (id === undefined) return;
      folders += 1;
      await visit(id);
      report();
    }
  };

  const running = new Set<Promise<void>>();
  const pump = () => {
    while (
      running.size < limits.concurrency &&
      queue.length > 0 &&
      stop === null
    ) {
      const task = worker().finally(() => {
        running.delete(task);
      });
      running.add(task);
    }
  };

  pump();
  while (running.size > 0) {
    await Promise.race(running);
    pump();
  }

  return {
    stop: stop ?? limitHit() ?? 'done',
    folders,
    queued: queue.length,
    nodes,
    failed: failedIds.length,
    failedIds,
  };
}
