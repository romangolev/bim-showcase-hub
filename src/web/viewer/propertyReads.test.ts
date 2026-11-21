import { afterEach, describe, expect, it, vi } from 'vitest';
import { readInChunks, sumProgress } from './propertyReads.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('readInChunks', () => {
  it('reads in chunks and reports progress on the throttled cadence', async () => {
    vi.useFakeTimers();
    const calls: number[][] = [];
    const seen: number[] = [];
    const out = await readInChunks(
      [1, 2, 3, 4, 5],
      async (chunk) => {
        calls.push(chunk);
        vi.advanceTimersByTime(150);
        return chunk;
      },
      { onProgress: (p) => seen.push(p.loaded), size: 2 },
    );
    expect(calls).toEqual([[1, 2], [3, 4], [5]]);
    expect(seen).toEqual([0, 2, 4, 5]);
    expect(out).toEqual([1, 2, 3, 4, 5]);
  });

  it('coalesces fast chunk reports and always emits the final one', async () => {
    const seen: number[] = [];
    await readInChunks([1, 2, 3, 4, 5, 6], async (chunk) => chunk, {
      onProgress: (p) => seen.push(p.loaded),
      size: 1,
    });
    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBe(6);
    expect(seen.length).toBeLessThan(6);
  });

  it('reports each chunk of rows as it arrives', async () => {
    const sizes: number[] = [];
    await readInChunks([1, 2, 3, 4, 5], async (chunk) => chunk, {
      size: 2,
      onRows: (rows) => sizes.push(rows.length),
    });
    expect(sizes).toEqual([2, 2, 1]);
  });

  it('stops issuing chunks once aborted', async () => {
    const controller = new AbortController();
    const calls: number[][] = [];
    const read = readInChunks(
      [1, 2, 3, 4, 5, 6],
      async (chunk) => {
        calls.push(chunk);
        controller.abort();
        return chunk;
      },
      { signal: controller.signal, size: 2 },
    );
    await expect(read).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toEqual([[1, 2]]);
  });

  it('rejects during the batch in flight instead of waiting for it', async () => {
    const controller = new AbortController();
    let calls = 0;
    const read = readInChunks(
      [1, 2, 3, 4],
      () => {
        calls += 1;
        return new Promise<number[]>(() => undefined);
      },
      { signal: controller.signal, size: 2 },
    );
    await Promise.resolve();
    controller.abort();
    await expect(read).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toBe(1);
  });
});

describe('sumProgress', () => {
  it('adds the progress of every part and flushes the last report', () => {
    const seen: string[] = [];
    const progress = sumProgress((p) => seen.push(`${p.loaded}/${p.total}`));
    progress.report('a')({
      phase: 'rows',
      loaded: 1,
      total: 2,
      partial: true,
    });
    progress.report('b')({
      phase: 'rows',
      loaded: 0,
      total: 3,
      partial: true,
    });
    progress.report('a')({
      phase: 'rows',
      loaded: 2,
      total: 2,
      partial: true,
    });
    progress.flush();
    expect(seen).toEqual(['1/2', '2/5']);
  });
});
