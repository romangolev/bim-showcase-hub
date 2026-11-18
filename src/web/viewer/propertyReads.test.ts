import { describe, expect, it } from 'vitest';
import { readInChunks, sumProgress } from './propertyReads.js';

describe('readInChunks', () => {
  it('reads in chunks and reports progress after each', async () => {
    const calls: number[][] = [];
    const seen: number[] = [];
    const out = await readInChunks(
      [1, 2, 3, 4, 5],
      async (chunk) => {
        calls.push(chunk);
        return chunk;
      },
      { onProgress: (p) => seen.push(p.done) },
      2,
    );
    expect(calls).toEqual([[1, 2], [3, 4], [5]]);
    expect(seen).toEqual([0, 2, 4, 5]);
    expect(out).toEqual([1, 2, 3, 4, 5]);
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
      { signal: controller.signal },
      2,
    );
    await expect(read).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toEqual([[1, 2]]);
  });
});

describe('sumProgress', () => {
  it('adds the progress of every part', () => {
    const seen: string[] = [];
    const part = sumProgress((p) => seen.push(`${p.done}/${p.total}`));
    part('a')({ done: 1, total: 2 });
    part('b')({ done: 0, total: 3 });
    part('a')({ done: 2, total: 2 });
    expect(seen).toEqual(['1/2', '1/5', '2/5']);
  });
});
