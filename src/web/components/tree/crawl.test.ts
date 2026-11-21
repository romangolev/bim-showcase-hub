import { describe, expect, it, vi } from 'vitest';
import type { TreeNode } from '../../../shared/types.js';
import { ApiError } from '../../api/client.js';
import { crawl, retryDelayMs } from './crawl.js';

const folderNode = (id: string, parentId: string): TreeNode => ({
  id,
  kind: 'folder',
  name: id,
  hasChildren: true,
  viewable: false,
  parentId,
});

const itemNode = (id: string, parentId: string): TreeNode => ({
  id,
  kind: 'item',
  name: `${id}.rvt`,
  hasChildren: true,
  viewable: false,
  parentId,
});

const tree: Record<string, TreeNode[]> = {
  root: [
    folderNode('a', 'root'),
    folderNode('b', 'root'),
    itemNode('i0', 'root'),
  ],
  a: [folderNode('a1', 'a'), itemNode('i1', 'a')],
  b: [itemNode('i2', 'b')],
  a1: [itemNode('i3', 'a1')],
};

const instant = async () => undefined;

describe('crawl', () => {
  it('walks every folder breadth first and never expands items', async () => {
    const children = vi.fn(async (id: string) => tree[id] ?? []);
    const out = await crawl({
      start: ['root'],
      children,
      signal: new AbortController().signal,
      wait: instant,
    });
    expect(out.stop).toBe('done');
    expect(children.mock.calls.map(([id]) => id)).toEqual([
      'root',
      'a',
      'b',
      'a1',
    ]);
    expect(out.nodes).toBe(7);
  });

  it('stops at the folder limit', async () => {
    const out = await crawl({
      start: ['root'],
      children: async (id) => tree[id] ?? [],
      signal: new AbortController().signal,
      limits: { maxFolders: 2 },
      wait: instant,
    });
    expect(out.stop).toBe('folders');
    expect(out.folders).toBe(2);
  });

  it('waits Retry-After on 429 and then succeeds', async () => {
    const waits: number[] = [];
    let calls = 0;
    const children = async (id: string) => {
      if (id === 'a' && calls++ === 0) {
        throw new ApiError(429, 'Rate limited', 4000);
      }
      return tree[id] ?? [];
    };
    const out = await crawl({
      start: ['root'],
      children,
      signal: new AbortController().signal,
      wait: async (ms) => {
        waits.push(ms);
      },
    });
    expect(out.stop).toBe('done');
    expect(out.failed).toBe(0);
    expect(waits).toContain(4000);
  });

  it('gives up on a folder after maxRetries and keeps going', async () => {
    const children = async (id: string) => {
      if (id === 'a') throw new ApiError(502, 'Upstream');
      return tree[id] ?? [];
    };
    const out = await crawl({
      start: ['root'],
      children,
      signal: new AbortController().signal,
      wait: instant,
    });
    expect(out.failedIds).toEqual(['a']);
    expect(out.stop).toBe('done');
  });

  it('does not retry a 404', async () => {
    const children = vi.fn(async (id: string) => {
      if (id === 'b') throw new ApiError(404, 'Not found');
      return tree[id] ?? [];
    });
    await crawl({
      start: ['root'],
      children,
      signal: new AbortController().signal,
      wait: instant,
    });
    expect(children.mock.calls.filter(([id]) => id === 'b')).toHaveLength(1);
  });

  it('stops when cancelled and issues no new requests', async () => {
    const controller = new AbortController();
    const children = vi.fn(async (id: string) => {
      if (id === 'a') controller.abort();
      return tree[id] ?? [];
    });
    const out = await crawl({
      start: ['root'],
      children,
      signal: controller.signal,
      limits: { concurrency: 1 },
      wait: instant,
    });
    expect(out.stop).toBe('cancelled');
    expect(children.mock.calls.map(([id]) => id)).not.toContain('a1');
  });

  it('stops on the time budget', async () => {
    let t = 0;
    const out = await crawl({
      start: ['root'],
      children: async (id) => {
        t += 50_000;
        return tree[id] ?? [];
      },
      signal: new AbortController().signal,
      now: () => t,
      wait: instant,
    });
    expect(out.stop).toBe('time');
  });
});

describe('retryDelayMs', () => {
  it('uses Retry-After for 429, backoff for 5xx and none for 4xx', () => {
    expect(retryDelayMs(new ApiError(429, 'x', 2000), 0)).toBe(2000);
    expect(retryDelayMs(new ApiError(429, 'x', 90_000), 0)).toBe(30_000);
    expect(retryDelayMs(new ApiError(502, 'x'), 2)).toBe(4000);
    expect(retryDelayMs(new TypeError('network'), 0)).toBe(1000);
    expect(retryDelayMs(new ApiError(404, 'x'), 0)).toBeNull();
  });
});
