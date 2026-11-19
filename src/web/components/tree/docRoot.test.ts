import { beforeEach, describe, expect, it } from 'vitest';
import type { TreeNode } from '../../../shared/types.js';
import { ROOT_NODE, ROOT_SCOPE } from '../../api/scope.js';
import { forgetPersonal } from '../../storage.js';
import { installMemoryStorage } from '../../test/mockApi.js';
import {
  ALL_HUBS,
  DEFAULT_TREE_ROOT,
  DOC_ROOT,
  DOC_ROOT_KEY,
  effectiveDocRoot,
  hubScope,
  sanitizeDocRoot,
  treeRootOf,
} from './docRoot.js';

const hub: TreeNode = {
  id: 'h1',
  kind: 'hub',
  name: 'Studio hub',
  hasChildren: true,
  viewable: false,
};

const project: TreeNode = {
  id: 'p1',
  kind: 'project',
  name: 'Riverside Tower',
  hasChildren: true,
  viewable: false,
  parentId: 'h1',
};

beforeEach(() => {
  installMemoryStorage();
});

describe('sanitizeDocRoot', () => {
  it('keeps a hub and project and drops junk', () => {
    expect(sanitizeDocRoot({ hubId: 'h1', projectId: 'p1' })).toEqual({
      hubId: 'h1',
      projectId: 'p1',
    });
    expect(sanitizeDocRoot({ hubId: 'h1' })).toEqual({
      hubId: 'h1',
      projectId: null,
    });
    expect(sanitizeDocRoot({ hubId: '', projectId: 'p1' })).toEqual(ALL_HUBS);
    expect(sanitizeDocRoot({ hubId: 7 })).toEqual(ALL_HUBS);
    expect(sanitizeDocRoot(null)).toEqual(ALL_HUBS);
  });
});

describe('DOC_ROOT', () => {
  it('is a personal record under the portable pane prefix', () => {
    expect(DOC_ROOT_KEY.startsWith('bsh.pane.')).toBe(true);
    DOC_ROOT.write({ hubId: 'h1', projectId: 'p1' });
    expect(DOC_ROOT.read()).toEqual({ hubId: 'h1', projectId: 'p1' });
    forgetPersonal();
    expect(DOC_ROOT.read()).toEqual(ALL_HUBS);
  });
});

describe('effectiveDocRoot', () => {
  it('falls back to all hubs when the stored hub is gone', () => {
    expect(
      effectiveDocRoot({ hubId: 'gone', projectId: null }, [hub], []),
    ).toEqual(ALL_HUBS);
  });

  it('falls back to the hub when the stored project is gone', () => {
    expect(
      effectiveDocRoot({ hubId: 'h1', projectId: 'gone' }, [hub], [project]),
    ).toEqual({ hubId: 'h1', projectId: null });
  });

  it('keeps a valid choice and trusts it while the lists load', () => {
    expect(
      effectiveDocRoot({ hubId: 'h1', projectId: 'p1' }, [hub], [project]),
    ).toEqual({ hubId: 'h1', projectId: 'p1' });
    expect(
      effectiveDocRoot({ hubId: 'h1', projectId: 'p1' }, undefined, undefined),
    ).toEqual({ hubId: 'h1', projectId: 'p1' });
  });
});

describe('treeRootOf', () => {
  it('roots at every hub by default', () => {
    expect(treeRootOf(ALL_HUBS, [hub], [project])).toEqual(DEFAULT_TREE_ROOT);
    expect(DEFAULT_TREE_ROOT.node).toBe(ROOT_NODE);
    expect(DEFAULT_TREE_ROOT.scope).toBe(ROOT_SCOPE);
  });

  it('roots at a hub with its projects scope', () => {
    const root = treeRootOf({ hubId: 'h1', projectId: null }, [hub], [project]);
    expect(root.node).toEqual(hub);
    expect(root.scope).toEqual(hubScope('h1'));
  });

  it('roots at a project without its hub parent', () => {
    const root = treeRootOf({ hubId: 'h1', projectId: 'p1' }, [hub], [project]);
    expect(root.node).toMatchObject({
      id: 'p1',
      kind: 'project',
      name: 'Riverside Tower',
    });
    expect(root.node.parentId).toBeUndefined();
    expect(root.scope).toEqual({
      kind: 'project',
      id: 'p1',
      hubId: 'h1',
      projectId: 'p1',
    });
  });

  it('uses a placeholder hub until the hub list arrives', () => {
    const root = treeRootOf({ hubId: 'h1', projectId: null }, undefined, [
      project,
    ]);
    expect(root.node).toMatchObject({ id: 'h1', kind: 'hub' });
    expect(root.scope).toEqual(hubScope('h1'));
  });
});
