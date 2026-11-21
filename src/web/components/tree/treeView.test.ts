import { describe, expect, it } from 'vitest';
import type { TreeNode } from '../../../shared/types.js';
import {
  DEFAULT_TREE_VIEW,
  formatSize,
  metaText,
  sanitizeTreeView,
  sortChildren,
} from './treeView.js';

function node(
  name: string,
  kind: TreeNode['kind'],
  modifiedAt?: string,
): TreeNode {
  return {
    id: name,
    kind,
    name,
    hasChildren: kind !== 'version',
    viewable: false,
    ...(modifiedAt ? { modifiedAt } : {}),
  };
}

describe('sortChildren', () => {
  const nodes = [
    node('b.rvt', 'item', '2025-01-02T00:00:00.000Z'),
    node('Z folder', 'folder'),
    node('a10.rvt', 'item', '2025-03-01T00:00:00.000Z'),
    node('a2.rvt', 'item'),
  ];

  it('sorts by name naturally with folders first', () => {
    expect(sortChildren(nodes, 'name').map((n) => n.name)).toEqual([
      'Z folder',
      'a2.rvt',
      'a10.rvt',
      'b.rvt',
    ]);
  });

  it('sorts newest first and puts undated items last', () => {
    expect(sortChildren(nodes, 'modified').map((n) => n.name)).toEqual([
      'Z folder',
      'a10.rvt',
      'b.rvt',
      'a2.rvt',
    ]);
  });

  it('leaves hubs, projects and versions in server order', () => {
    const hubs = [node('b', 'hub'), node('a', 'hub')];
    expect(sortChildren(hubs, 'name')).toBe(hubs);
  });
});

describe('metaText and view', () => {
  it('joins the enabled columns and formats sizes', () => {
    const item = {
      ...node('a.rvt', 'item', '2025-03-04T10:20:30.000Z'),
      modifiedBy: 'Sam',
      size: 5 * 1024 * 1024,
    };
    expect(metaText(item, DEFAULT_TREE_VIEW)).toBe('2025-03-04');
    expect(
      metaText(item, { ...DEFAULT_TREE_VIEW, author: true, size: true }),
    ).toBe('2025-03-04 · Sam · 5.0 MB');
    expect(formatSize(512)).toBe('512 B');
  });

  it('keeps only size for versions, whose row already shows date and author', () => {
    const version = { ...node('v1: x by y', 'version'), size: 2048 };
    expect(metaText(version, { ...DEFAULT_TREE_VIEW, size: true })).toBe(
      '2.0 KB',
    );
  });

  it('sanitizes stored junk', () => {
    expect(sanitizeTreeView({ sort: 'x', modified: 3 })).toEqual(
      DEFAULT_TREE_VIEW,
    );
  });

  it('defaults filter searches to loaded folders and keeps the project scope', () => {
    expect(DEFAULT_TREE_VIEW.searchScope).toBe('loaded');
    expect(sanitizeTreeView({ searchScope: 'project' }).searchScope).toBe(
      'project',
    );
    expect(sanitizeTreeView({ searchScope: 'nope' }).searchScope).toBe(
      'loaded',
    );
  });

  it('keeps a known open mode and falls back to a new tab', () => {
    expect(DEFAULT_TREE_VIEW.openMode).toBe('tab');
    expect(sanitizeTreeView({ openMode: 'combined' }).openMode).toBe(
      'combined',
    );
    expect(sanitizeTreeView({ openMode: 'replace' }).openMode).toBe('replace');
    expect(sanitizeTreeView({ openMode: 'nope' }).openMode).toBe('tab');
  });

  it('shows every home section until one is switched off', () => {
    expect(DEFAULT_TREE_VIEW.homeRecent).toBe(true);
    expect(DEFAULT_TREE_VIEW.homePinned).toBe(true);
    expect(DEFAULT_TREE_VIEW.homeSets).toBe(true);
    expect(DEFAULT_TREE_VIEW.homeModelSets).toBe(true);
    expect(sanitizeTreeView({ homeSets: false }).homeSets).toBe(false);
    expect(sanitizeTreeView({ homeSets: 'no' }).homeSets).toBe(true);
    expect(sanitizeTreeView({ homeModelSets: false }).homeModelSets).toBe(
      false,
    );
    expect(sanitizeTreeView({ homeModelSets: 'no' }).homeModelSets).toBe(true);
  });

  it('keeps a valid itemOpen and defaults the rest to expand', () => {
    expect(DEFAULT_TREE_VIEW.itemOpen).toBe('expand');
    expect(sanitizeTreeView({ itemOpen: 'latest' }).itemOpen).toBe('latest');
    expect(sanitizeTreeView({ itemOpen: 'last' }).itemOpen).toBe('last');
    expect(sanitizeTreeView({ itemOpen: 'nope' }).itemOpen).toBe('expand');
    expect(sanitizeTreeView({}).itemOpen).toBe('expand');
  });

  it('keeps thumbnails off and list rows until asked', () => {
    expect(DEFAULT_TREE_VIEW.thumbnails).toBe(false);
    expect(DEFAULT_TREE_VIEW.rows).toBe('list');
    expect(sanitizeTreeView({ thumbnails: true }).thumbnails).toBe(true);
    expect(sanitizeTreeView({ thumbnails: 'yes' }).thumbnails).toBe(false);
    expect(sanitizeTreeView({ rows: 'thumbnails' }).rows).toBe('thumbnails');
    expect(sanitizeTreeView({ rows: 'grid' }).rows).toBe('list');
  });
});
