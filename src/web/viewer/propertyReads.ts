export const READ_CHUNK = 5000;
export const PROGRESS_INTERVAL_MS = 100;
export const UNCATEGORIZED = 'Other';

export type ReadPhase = 'rows' | 'discovery';

export interface ReadProgress {
  phase: ReadPhase;
  loaded: number;
  total: number;
  partial: boolean;
}

export interface ReadOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ReadProgress) => void;
}

export interface PropertyInfo {
  name: string;
  category: string;
}

export interface ProgressReporter {
  report: (progress: ReadProgress) => void;
  flush: () => void;
}

export function abortError(): Error {
  return new DOMException('The read was cancelled', 'AbortError');
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

export function throttleProgress(
  onProgress: ReadOptions['onProgress'],
  intervalMs = PROGRESS_INTERVAL_MS,
): ProgressReporter {
  let latest: ReadProgress | null = null;
  let lastEmit = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const send = () => {
    if (!latest || !onProgress) return;
    const next = latest;
    latest = null;
    lastEmit = Date.now();
    onProgress(next);
  };

  const schedule = () => {
    if (timer !== null) return;
    const wait = Math.max(0, intervalMs - (Date.now() - lastEmit));
    timer = setTimeout(() => {
      timer = null;
      send();
    }, wait);
  };

  return {
    report: (progress) => {
      if (!onProgress) return;
      latest = progress;
      if (Date.now() - lastEmit >= intervalMs) {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        send();
      } else {
        schedule();
      }
    },
    flush: () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      send();
    },
  };
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

export interface ChunkReadOptions extends ReadOptions {
  phase?: ReadPhase;
  size?: number;
}

export async function readInChunks<T>(
  ids: readonly number[],
  read: (chunk: number[]) => Promise<T[]>,
  {
    signal,
    onProgress,
    phase = 'rows',
    size = READ_CHUNK,
  }: ChunkReadOptions = {},
): Promise<T[]> {
  const progress = throttleProgress(onProgress);
  const out: T[] = [];
  let loaded = 0;
  const report = () =>
    progress.report({
      phase,
      loaded,
      total: ids.length,
      partial: loaded < ids.length,
    });
  report();
  try {
    for (let start = 0; start < ids.length; start += size) {
      throwIfAborted(signal);
      out.push(
        ...(await abortable(read(ids.slice(start, start + size)), signal)),
      );
      loaded = Math.min(start + size, ids.length);
      report();
    }
    throwIfAborted(signal);
    return out;
  } finally {
    progress.flush();
  }
}

export interface ProgressSink {
  report: (key: string) => (progress: ReadProgress) => void;
  flush: () => void;
}

export function sumProgress(
  onProgress: ReadOptions['onProgress'],
): ProgressSink {
  const parts = new Map<string, ReadProgress>();
  const reporter = throttleProgress(onProgress);
  let phase: ReadPhase = 'rows';
  return {
    report: (key) => (progress) => {
      parts.set(key, progress);
      phase = progress.phase;
      let loaded = 0;
      let total = 0;
      for (const part of parts.values()) {
        loaded += part.loaded;
        total += part.total;
      }
      reporter.report({
        phase,
        loaded,
        total,
        partial: loaded < total,
      });
    },
    flush: reporter.flush,
  };
}

export function mergeInfos(
  lists: readonly (readonly PropertyInfo[])[],
): PropertyInfo[] {
  const seen = new Map<string, PropertyInfo>();
  for (const list of lists) {
    for (const info of list)
      seen.set(`${info.category}\u0000${info.name}`, info);
  }
  return [...seen.values()].sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  );
}

export interface ElementProperty {
  category: string;
  name: string;
  value: string | number | boolean | null;
}

export interface ElementProperties {
  dbId: number;
  name: string;
  properties: ElementProperty[];
}
