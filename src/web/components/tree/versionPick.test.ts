import { describe, expect, it } from 'vitest';
import type { TreeNode } from '../../../shared/types.js';
import { pickLastOpened, pickLatest } from './versionPick.js';

const v = (id: string, n: number, extra: Partial<TreeNode> = {}): TreeNode => ({
  id,
  kind: 'version',
  name: `v${n}: 2025-01-01 10:00 by Sam`,
  hasChildren: false,
  viewable: true,
  viewState: 'ready',
  urn: `urn-${id}`,
  versionNumber: n,
  ...extra,
});

describe('pickLatest', () => {
  it('prefers the node marked latest', () => {
    expect(
      pickLatest([v('a', 1), v('b', 2, { latest: true }), v('c', 3)])?.id,
    ).toBe('b');
  });

  it('falls back to the highest number', () => {
    expect(pickLatest([v('a', 1), v('c', 3), v('b', 2)])?.id).toBe('c');
  });

  it('returns null for no versions', () => {
    expect(pickLatest([])).toBeNull();
  });
});

describe('pickLastOpened', () => {
  it('returns the version whose urn was opened most recently', () => {
    const list = [v('a', 1), v('b', 2), v('c', 3)];
    expect(pickLastOpened(list, ['urn-x', 'urn-b', 'urn-a'])?.id).toBe('b');
  });

  it('returns null when none was opened', () => {
    expect(pickLastOpened([v('a', 1)], ['urn-x'])).toBeNull();
  });
});
