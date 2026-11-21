import type { Command } from '../../commands/types.js';
import type { PickedModel, TreeState } from './treeState.js';

export const TREE_COMMAND_LIMIT = 500;

export function treeCommands(
  state: Pick<TreeState, 'search' | 'open' | 'parentName'>,
  perform: (model: PickedModel) => void,
): Command[] {
  return state
    .search('')
    .filter((node) => node.kind === 'version' && node.viewable && node.urn)
    .slice(0, TREE_COMMAND_LIMIT)
    .map((node) => ({
      id: `tree.open.${node.id}`,
      title: `Open ${node.name}`,
      group: 'Documents (loaded folders)',
      icon: 'version' as const,
      keywords: state.parentName(node) ?? '',
      searchOnly: true,
      run: () => state.open(node, perform),
    }));
}
