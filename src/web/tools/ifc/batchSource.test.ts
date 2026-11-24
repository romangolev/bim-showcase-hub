import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { TreeNode } from '../../../shared/types.js';
import { scopeKey } from '../../api/scope.js';
import { listBatchRows } from './batchSource.js';

const node = (
  patch: Partial<TreeNode> & Pick<TreeNode, 'id' | 'kind'>,
): TreeNode => ({
  name: patch.id,
  hasChildren: false,
  viewable: false,
  ...patch,
});

function seeded() {
  const client = new QueryClient();
  client.setQueryData(scopeKey({ kind: 'hub', id: 'h', hubId: 'h' }), [
    node({ id: 'p', kind: 'project', name: 'Tower Project' }),
  ]);
  client.setQueryData(
    scopeKey({ kind: 'folder', id: 'f', hubId: 'h', projectId: 'p' }),
    [
      node({ id: 'i1', kind: 'item', name: 'Arch.rvt' }),
      node({ id: 'i2', kind: 'item', name: 'Mep.rvt' }),
    ],
  );
  client.setQueryData(
    scopeKey({ kind: 'item', id: 'i1', hubId: 'h', projectId: 'p' }),
    [
      node({
        id: 'v2',
        kind: 'version',
        name: 'v2: today by me',
        versionNumber: 2,
        urn: 'urn-2',
        viewState: 'ready',
      }),
      node({
        id: 'v1',
        kind: 'version',
        name: 'v1: old by me',
        versionNumber: 1,
        urn: 'urn-2',
        viewState: 'ready',
      }),
      node({ id: 'v0', kind: 'version', name: 'v0: raw', versionNumber: 3 }),
    ],
  );
  return client;
}

describe('listBatchRows', () => {
  it('builds rows from cached tree levels with the project name', () => {
    const { rows } = listBatchRows(seeded());
    const first = rows[0];
    expect(first?.file).toBe('Arch.rvt');
    expect(first?.project).toBe('Tower Project');
    expect(first?.projectId).toBe('p');
    expect(first?.version).toBe('v0');
  });

  it('removes exact urn duplicates', () => {
    const { rows } = listBatchRows(seeded());
    expect(rows.filter((row) => row.urn === 'urn-2')).toHaveLength(1);
  });

  it('flags versions without a urn as not viewable', () => {
    const { rows } = listBatchRows(seeded());
    const raw = rows.find((row) => row.urn === undefined);
    expect(raw?.state).toBe('not-translated');
  });

  it('lists items whose versions are not cached', () => {
    const { pendingItems } = listBatchRows(seeded());
    expect(pendingItems).toEqual([
      { kind: 'item', id: 'i2', hubId: 'h', projectId: 'p' },
    ]);
  });
});
