import type { TreeNode } from '../../shared/types.js';
import { viewableFor, viewStateOf } from '../../shared/viewState.js';

export function openableUrn(node: TreeNode): string | null {
  if (node.kind === 'version' && viewableFor(viewStateOf(node)) && node.urn) {
    return node.urn;
  }
  return null;
}
