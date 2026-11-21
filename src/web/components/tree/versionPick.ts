import type { TreeNode } from '../../../shared/types.js';

export function pickLatest(versions: readonly TreeNode[]): TreeNode | null {
  const marked = versions.find((node) => node.latest);
  if (marked) return marked;
  let top: TreeNode | null = null;
  for (const node of versions) {
    if ((node.versionNumber ?? -1) > (top?.versionNumber ?? -1)) top = node;
  }
  return top;
}

export function pickLastOpened(
  versions: readonly TreeNode[],
  recentUrns: readonly string[],
): TreeNode | null {
  for (const urn of recentUrns) {
    const found = versions.find((node) => node.urn === urn);
    if (found) return found;
  }
  return null;
}
