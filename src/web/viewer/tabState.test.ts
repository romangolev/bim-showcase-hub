import { describe, expect, it } from 'vitest';
import {
  capTabState,
  countStateIds,
  MAX_TAB_STATE_IDS,
  shouldRestore,
} from './tabState.js';
import type { ViewerState } from './ViewerAdapter.js';

const base: ViewerState = {
  version: 1,
  camera: null,
  cutplanes: [[0, 0, 1, 0]],
  models: {},
};

describe('capTabState', () => {
  it('keeps a small state as is', () => {
    const state = {
      ...base,
      models: { a: { isolated: [], hidden: [1, 2], selection: [3] } },
    };
    expect(capTabState(state)).toEqual(state);
  });

  it('counts every node list of every model', () => {
    expect(
      countStateIds({
        ...base,
        models: {
          a: { isolated: [1], hidden: [2, 3], selection: [4] },
          b: { isolated: [], hidden: [], selection: [5, 6] },
        },
      }),
    ).toBe(6);
    expect(countStateIds(base)).toBe(0);
  });

  it('drops node lists over the cap and keeps camera, planes and explode', () => {
    const hidden = Array.from({ length: MAX_TAB_STATE_IDS + 1 }, (_, i) => i);
    const capped = capTabState({
      ...base,
      explode: 0.3,
      models: { a: { isolated: [], hidden, selection: [] } },
    });
    expect(capped).toEqual({ ...base, explode: 0.3, models: {} });
  });

  it('keeps a state exactly at the cap', () => {
    const hidden = Array.from({ length: MAX_TAB_STATE_IDS }, (_, i) => i);
    const state = {
      ...base,
      models: { a: { isolated: [], hidden, selection: [] } },
    };
    expect(capTabState(state)).toBe(state);
  });
});

describe('shouldRestore', () => {
  it('restores only a saved state with no incoming link', () => {
    expect(shouldRestore(base, null)).toBe(true);
    expect(shouldRestore(base, '3~abc')).toBe(false);
    expect(shouldRestore(null, null)).toBe(false);
    expect(shouldRestore(undefined, null)).toBe(false);
  });
});
