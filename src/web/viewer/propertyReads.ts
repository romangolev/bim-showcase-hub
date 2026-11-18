export const READ_CHUNK = 5000;
export const DISCOVERY_SAMPLE = 300;
export const UNCATEGORIZED = 'Other';

export interface ReadProgress {
  done: number;
  total: number;
}

export interface ReadOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ReadProgress) => void;
}

export interface PropertyInfo {
  name: string;
  category: string;
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

export async function readInChunks<T>(
  ids: readonly number[],
  read: (chunk: number[]) => Promise<T[]>,
  { signal, onProgress }: ReadOptions = {},
  size = READ_CHUNK,
): Promise<T[]> {
  const out: T[] = [];
  onProgress?.({ done: 0, total: ids.length });
  for (let start = 0; start < ids.length; start += size) {
    throwIfAborted(signal);
    out.push(...(await read(ids.slice(start, start + size))));
    onProgress?.({
      done: Math.min(start + size, ids.length),
      total: ids.length,
    });
  }
  throwIfAborted(signal);
  return out;
}

export function sumProgress(
  onProgress: ReadOptions['onProgress'],
): (key: string) => (progress: ReadProgress) => void {
  const parts = new Map<string, ReadProgress>();
  return (key) => (progress) => {
    parts.set(key, progress);
    let done = 0;
    let total = 0;
    for (const part of parts.values()) {
      done += part.done;
      total += part.total;
    }
    onProgress?.({ done, total });
  };
}

export function sampleIds(ids: readonly number[], count: number): number[] {
  if (ids.length <= count) return [...ids];
  const step = ids.length / count;
  return Array.from(
    { length: count },
    (_, i) => ids[Math.floor(i * step)] ?? 0,
  );
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
