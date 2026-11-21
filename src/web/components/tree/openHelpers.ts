import {
  MAX_COMBINED_MODELS,
  MAX_LOADED_MEMBERS,
} from '../../../shared/combined.js';
import type { ModelContext } from '../../api/modelContext.js';
import { rememberModel } from '../../api/modelStore.js';
import {
  contextOf,
  isOpen,
  liveWeight,
  modelUrnsOf,
  type OpenModelsState,
  type OpenModelsStore,
} from '../../api/openModels.js';
import type { PickedModel } from './DocumentTree.js';
import { overTabLimit } from './treeState.js';
import type { TreeOpenMode } from './treeView.js';

export interface OpenTarget {
  urn: string;
  context: ModelContext;
  notice?: string;
}

const COMBINED_FULL_NOTICE = 'The open viewer is full; opened a new tab';

export function exceedsTabLimit(
  state: OpenModelsState,
  models: readonly PickedModel[],
): boolean {
  const fresh = models.filter((model) => !isOpen(state, model.urn)).length;
  return overTabLimit(loadedMembers(state), fresh);
}

export function canJoinTab(
  state: OpenModelsState,
  target: string,
  urn: string,
): boolean {
  const members = modelUrnsOf(state, target);
  return (
    !members.includes(urn) &&
    !isOpen(state, urn) &&
    members.length < MAX_COMBINED_MODELS
  );
}

export function loadedMembers(state: OpenModelsState): number {
  return state.models.reduce(
    (sum, model) => sum + liveWeight(state, model.urn),
    0,
  );
}

export function openPickedAsTabs(
  store: OpenModelsStore | null,
  models: readonly PickedModel[],
): PickedModel[] {
  const admitted = models.slice(0, MAX_LOADED_MEMBERS);
  for (const model of admitted) {
    rememberModel(model.urn, model.context);
    store?.open(model.urn, model.context);
  }
  return admitted;
}

export function openAsTab(
  store: OpenModelsStore | null,
  urn: string,
  context: ModelContext,
): OpenTarget {
  openPickedAsTabs(store, [{ urn, context }]);
  return { urn, context };
}

export function openWithMode(
  mode: TreeOpenMode,
  store: OpenModelsStore | null,
  state: OpenModelsState,
  urn: string,
  context: ModelContext,
): OpenTarget {
  if (!store) return { urn, context };
  const active = state.active;
  if (mode === 'replace' && active && active !== urn) {
    const dropped = modelUrnsOf(state, active);
    rememberModel(urn, context);
    store.open(urn, context);
    store.close(active);
    return {
      urn,
      context,
      notice:
        dropped.length > 1
          ? `Closed the combined tab and its ${dropped.length} models`
          : undefined,
    };
  }
  const members = active ? modelUrnsOf(state, active) : [];
  if (
    mode === 'combined' &&
    active &&
    !members.includes(urn) &&
    !isOpen(state, urn)
  ) {
    if (members.length < MAX_COMBINED_MODELS) {
      rememberModel(urn, context);
      store.addTo(active, urn);
      return {
        urn: active,
        context: contextOf(store.getState(), active) ?? {},
      };
    }
    store.open(urn, context);
    return { urn, context, notice: COMBINED_FULL_NOTICE };
  }
  store.open(urn, context);
  return { urn, context };
}
