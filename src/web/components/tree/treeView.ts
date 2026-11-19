import { flag } from '../../../shared/guards.js';
import type { TreeNode } from '../../../shared/types.js';

export type TreeSort = 'name' | 'modified';

export type TreeOpenMode = 'tab' | 'replace' | 'combined';

function sanitizeOpenMode(raw: unknown): TreeOpenMode {
  return raw === 'replace' || raw === 'combined' ? raw : 'tab';
}

export interface TreeView {
  sort: TreeSort;
  modified: boolean;
  author: boolean;
  size: boolean;
  openMode: TreeOpenMode;
  homeRecent: boolean;
  homePinned: boolean;
  homeSets: boolean;
}

export const DEFAULT_TREE_VIEW: TreeView = {
  sort: 'name',
  modified: true,
  author: false,
  size: false,
  openMode: 'tab',
  homeRecent: true,
  homePinned: true,
  homeSets: true,
};

export function sanitizeTreeView(raw: unknown): TreeView {
  const source =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  return {
    sort: source.sort === 'modified' ? 'modified' : 'name',
    modified: flag(source.modified, DEFAULT_TREE_VIEW.modified),
    author: flag(source.author, DEFAULT_TREE_VIEW.author),
    size: flag(source.size, DEFAULT_TREE_VIEW.size),
    openMode: sanitizeOpenMode(source.openMode),
    homeRecent: flag(source.homeRecent, DEFAULT_TREE_VIEW.homeRecent),
    homePinned: flag(source.homePinned, DEFAULT_TREE_VIEW.homePinned),
    homeSets: flag(source.homeSets, DEFAULT_TREE_VIEW.homeSets),
  };
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

function time(node: TreeNode): number {
  const value = node.modifiedAt ? Date.parse(node.modifiedAt) : Number.NaN;
  return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value;
}

export function sortChildren(nodes: TreeNode[], sort: TreeSort): TreeNode[] {
  const contents = nodes.every(
    (node) => node.kind === 'folder' || node.kind === 'item',
  );
  if (!contents) return nodes;
  const rank = (node: TreeNode) => (node.kind === 'folder' ? 0 : 1);
  return [...nodes].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (sort === 'modified') {
      const diff = time(b) - time(a);
      if (diff !== 0 && !Number.isNaN(diff)) return diff;
    }
    return collator.compare(a.name, b.name);
  });
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function metaText(node: TreeNode, view: TreeView): string {
  const parts: string[] = [];
  if (node.kind !== 'version') {
    if (view.modified && node.modifiedAt) {
      parts.push(node.modifiedAt.slice(0, 10));
    }
    if (view.author && node.modifiedBy) parts.push(node.modifiedBy);
  }
  if (view.size && node.size !== undefined) parts.push(formatSize(node.size));
  return parts.join(' · ');
}
