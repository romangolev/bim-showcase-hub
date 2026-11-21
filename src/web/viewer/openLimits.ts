import {
  MAX_COMBINED_MODELS,
  MAX_LOADED_MEMBERS,
} from '../../shared/combined.js';
import type { TreeNode } from '../../shared/types.js';
import { viewableFor, viewStateOf } from '../../shared/viewState.js';
import { MODEL_LIMIT_MESSAGE } from './modelSet.js';

export interface PickLimit {
  tooManyTabs: boolean;
  tooManyCombined: boolean;
  message: string | null;
}

export function openableUrn(node: TreeNode): string | null {
  if (node.kind === 'version' && viewableFor(viewStateOf(node)) && node.urn) {
    return node.urn;
  }
  return null;
}

export function tabLimitMessage(openCount: number): string {
  const room = MAX_LOADED_MEMBERS - openCount;
  const open =
    openCount === 0
      ? ''
      : `${openCount} ${openCount === 1 ? 'model is' : 'models are'} already loaded. `;
  return room < 1
    ? `A viewer loads up to ${MAX_LOADED_MEMBERS} models. ${open}Close a model to open another.`
    : `A viewer loads up to ${MAX_LOADED_MEMBERS} models. ${open}Select ${room} or fewer to open them as tabs.`;
}

export function overTabLimit(loaded: number, fresh: number): boolean {
  return loaded + fresh > MAX_LOADED_MEMBERS;
}

export function pickLimit(openCount: number, picked: number): PickLimit {
  const tooManyCombined = picked > MAX_COMBINED_MODELS;
  const tooManyTabs = overTabLimit(openCount, picked);
  return {
    tooManyTabs,
    tooManyCombined,
    message: tooManyTabs
      ? tabLimitMessage(openCount)
      : tooManyCombined
        ? MODEL_LIMIT_MESSAGE
        : null,
  };
}
