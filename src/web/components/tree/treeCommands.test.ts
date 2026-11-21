import { describe, expect, it, vi } from 'vitest';
import type { TreeNode } from '../../../shared/types.js';
import { TREE_COMMAND_LIMIT, treeCommands } from './treeCommands.js';

function node(id: string, kind: TreeNode['kind'], viewable = true): TreeNode {
  return {
    id,
    kind,
    name: `${id}.rvt`,
    hasChildren: false,
    viewable,
    urn: `urn-${id}`,
  };
}

describe('treeCommands', () => {
  it('turns loaded viewable versions into search-only open commands', () => {
    const nodes = [
      node('a', 'version'),
      node('f', 'folder', false),
      node('b', 'version', false),
    ];
    const state = {
      search: () => nodes,
      open: vi.fn(),
      parentName: () => 'Models',
    };
    const list = treeCommands(state, vi.fn());
    expect(list.map((c) => c.id)).toEqual(['tree.open.a']);
    expect(list[0]?.searchOnly).toBe(true);
    expect(list[0]?.keywords).toContain('Models');
  });

  it('opens the node through the tree state', () => {
    const state = {
      search: () => [node('a', 'version')],
      open: vi.fn(),
      parentName: () => undefined,
    };
    const perform = vi.fn();
    treeCommands(state, perform)[0]?.run({ openModal: () => undefined });
    expect(state.open).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a' }),
      perform,
    );
  });

  it('caps the list', () => {
    const many = Array.from({ length: TREE_COMMAND_LIMIT + 5 }, (_, i) =>
      node(String(i), 'version'),
    );
    const state = {
      search: () => many,
      open: vi.fn(),
      parentName: () => undefined,
    };
    expect(treeCommands(state, vi.fn())).toHaveLength(TREE_COMMAND_LIMIT);
  });
});
