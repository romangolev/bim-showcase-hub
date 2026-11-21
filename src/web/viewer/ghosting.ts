import type { ModelDbId } from './modelSet.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

export type GhostClaimant = 'colors' | 'tint' | 'paint';

interface GhostState {
  claims: Map<GhostClaimant, readonly ModelDbId[]>;
  ghosting: boolean | null;
  solidKey: string;
}

const states = new WeakMap<ViewerAdapter, GhostState>();

function stateOf(adapter: ViewerAdapter): GhostState {
  let state = states.get(adapter);
  if (!state) {
    state = { claims: new Map(), ghosting: null, solidKey: '' };
    states.set(adapter, state);
  }
  return state;
}

function keyOf(items: readonly ModelDbId[]): string {
  return items
    .map((item) => `${item.modelId}:${item.dbId}`)
    .sort()
    .join('|');
}

function settle(adapter: ViewerAdapter, state: GhostState): void {
  const solid = [...state.claims.values()].flat();
  const solidKey = keyOf(solid);
  if (solidKey !== state.solidKey) {
    if (solid.length > 0) adapter.isolateModelIds(solid);
    else if (keyOf(adapter.getIsolated()) === state.solidKey) {
      adapter.isolateModelIds([]);
    }
    state.solidKey = solidKey;
  }
  const ghosting = state.claims.size > 0;
  if (ghosting === state.ghosting) return;
  adapter.setGhosting(ghosting);
  state.ghosting = ghosting;
}

export function claimGhosting(
  adapter: ViewerAdapter,
  claimant: GhostClaimant,
  solid: readonly ModelDbId[] = [],
): void {
  const state = stateOf(adapter);
  state.claims.set(claimant, solid);
  settle(adapter, state);
}

export function releaseGhosting(
  adapter: ViewerAdapter,
  claimant: GhostClaimant,
): void {
  const state = stateOf(adapter);
  state.claims.delete(claimant);
  settle(adapter, state);
}
