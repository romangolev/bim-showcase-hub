import { describe, expect, it } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { MODEL_STORE_KEY } from './modelStore.js';
import {
  activateModel,
  claimModels,
  closeModel,
  createOpenModelsStore,
  EMPTY_OPEN_MODELS,
  forgetModels,
  MAX_LOADED_MODELS,
  MODEL_OWNER_KEY,
  OPEN_MODELS_KEY,
  type OpenModelsState,
  openModel,
  parseOpenModels,
  touchLive,
} from './openModels.js';

function openAll(...urns: string[]): OpenModelsState {
  return urns.reduce(
    (state, urn) => openModel(state, urn, { file: `${urn}.rvt` }),
    EMPTY_OPEN_MODELS,
  );
}

describe('open models', () => {
  it('opens a model as the active, loaded tab', () => {
    const state = openModel(EMPTY_OPEN_MODELS, 'a', {
      file: 'A.rvt',
      v: 'v1',
      crumbs: ['Hub'],
    });
    expect(state.models).toEqual([
      { urn: 'a', context: { file: 'A.rvt', v: 'v1', crumbs: ['Hub'] } },
    ]);
    expect(state.active).toBe('a');
    expect(state.live).toEqual(['a']);
  });

  it('activates an open model instead of opening a duplicate', () => {
    const state = openAll('a', 'b');
    const again = openModel(state, 'a', { file: 'a.rvt' });
    expect(again.models.map((model) => model.urn)).toEqual(['a', 'b']);
    expect(again.active).toBe('a');
  });

  it('keeps the stored context when reopened without one', () => {
    const state = openModel(openAll('a', 'b'), 'a', {});
    expect(state.models[0]?.context).toEqual({ file: 'a.rvt' });
  });

  it('updates the context when reopened with a new one', () => {
    const state = openModel(openAll('a'), 'a', { file: 'a.rvt', v: 'v2' });
    expect(state.models[0]?.context).toEqual({ file: 'a.rvt', v: 'v2' });
  });

  it('closing a background tab keeps the active one', () => {
    const state = closeModel(openAll('a', 'b', 'c'), 'a');
    expect(state.models.map((model) => model.urn)).toEqual(['b', 'c']);
    expect(state.active).toBe('c');
  });

  it('closing the active tab activates its right neighbour, else the left one', () => {
    const middle = closeModel(activateModel(openAll('a', 'b', 'c'), 'b'), 'b');
    expect(middle.active).toBe('c');
    const last = closeModel(openAll('a', 'b', 'c'), 'c');
    expect(last.active).toBe('b');
  });

  it('closing the last tab leaves nothing active', () => {
    const state = closeModel(openAll('a'), 'a');
    expect(state).toEqual({ models: [], active: null, live: [] });
  });

  it('suspends the least recently shown model above the cap', () => {
    const urns = Array.from(
      { length: MAX_LOADED_MODELS + 1 },
      (_, index) => `m${index}`,
    );
    const state = openAll(...urns);
    expect(state.live).toHaveLength(MAX_LOADED_MODELS);
    expect(state.live).not.toContain('m0');
    expect(state.models).toHaveLength(MAX_LOADED_MODELS + 1);
    const back = activateModel(state, 'm0');
    expect(back.live).toContain('m0');
    expect(back.live).not.toContain('m1');
  });

  it('never suspends the active model when a background tab is shown', () => {
    let state = openAll('a', 'b', 'c');
    state = activateModel(state, 'a');
    state = touchLive(state, 'b', 2);
    expect(state.live).toEqual(['a', 'b']);
    expect(state.active).toBe('a');
  });

  it('ignores unknown urns', () => {
    const state = openAll('a');
    expect(activateModel(state, 'x')).toBe(state);
    expect(touchLive(state, 'x')).toBe(state);
    expect(closeModel(state, 'x')).toBe(state);
  });
});

describe('model stores per user', () => {
  function seed(storage: Storage) {
    storage.setItem(
      MODEL_STORE_KEY,
      JSON.stringify([{ urn: 'a', file: 'A.rvt' }]),
    );
    createOpenModelsStore(sessionStorage).open('a', { file: 'A.rvt' });
  }

  it('keeps the models of the same user', () => {
    const storage = installMemoryStorage();
    expect(claimModels('Ada')).toBe(false);
    seed(storage);
    expect(claimModels('Ada')).toBe(false);
    expect(storage.getItem(MODEL_STORE_KEY)).not.toBeNull();
    expect(
      createOpenModelsStore(sessionStorage).getState().models,
    ).toHaveLength(1);
  });

  it('forgets open and recent models when another user signs in', () => {
    const storage = installMemoryStorage();
    claimModels('Ada');
    seed(storage);
    expect(claimModels('Grace')).toBe(true);
    expect(storage.getItem(MODEL_STORE_KEY)).toBeNull();
    expect(sessionStorage.getItem(OPEN_MODELS_KEY)).toBeNull();
    expect(createOpenModelsStore(sessionStorage).getState().models).toEqual([]);
    expect(storage.getItem(MODEL_OWNER_KEY)).toBe('Grace');
  });

  it('clears a live store', () => {
    installMemoryStorage();
    const store = createOpenModelsStore(sessionStorage);
    store.open('a');
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    store.clear();
    expect(store.getState()).toEqual(EMPTY_OPEN_MODELS);
    expect(sessionStorage.getItem(OPEN_MODELS_KEY)).toBeNull();
    expect(calls).toBe(1);
    forgetModels();
  });
});

describe('open models persistence', () => {
  it('restores tabs and the active one without loading any', () => {
    const storage = installMemoryStorage();
    const first = createOpenModelsStore(storage);
    first.open('a', { file: 'A.rvt' });
    first.open('b', { file: 'B.rvt' });
    first.activate('a');
    const second = createOpenModelsStore(storage);
    expect(second.getState().models.map((model) => model.urn)).toEqual([
      'a',
      'b',
    ]);
    expect(second.getState().active).toBe('a');
    expect(second.getState().live).toEqual([]);
    second.show('b');
    expect(second.getState().live).toEqual(['b']);
  });

  it('notifies subscribers only on change', () => {
    const store = createOpenModelsStore(installMemoryStorage());
    let calls = 0;
    const stop = store.subscribe(() => {
      calls += 1;
    });
    store.open('a');
    store.open('a');
    store.activate('a');
    expect(calls).toBe(1);
    stop();
    store.close('a');
    expect(calls).toBe(1);
  });

  it('drops corrupt records and duplicates', () => {
    expect(parseOpenModels('{')).toEqual(EMPTY_OPEN_MODELS);
    const state = parseOpenModels(
      JSON.stringify({
        models: [
          { urn: 'a', context: { file: 'A.rvt' } },
          { urn: 'a' },
          { urn: 3 },
          { urn: 'b', context: { file: 9 } },
        ],
        active: 'zzz',
      }),
    );
    expect(state.models).toEqual([
      { urn: 'a', context: { file: 'A.rvt' } },
      { urn: 'b', context: {} },
    ]);
    expect(state.active).toBe('a');
  });

  it('works without storage', () => {
    const store = createOpenModelsStore(null);
    store.open('a');
    expect(store.getState().active).toBe('a');
  });

  it('writes under the session key', () => {
    const storage = installMemoryStorage();
    createOpenModelsStore(storage).open('a', { v: 'v1' });
    expect(JSON.parse(storage.getItem(OPEN_MODELS_KEY) ?? '{}')).toEqual({
      models: [{ urn: 'a', context: { v: 'v1' } }],
      active: 'a',
    });
  });
});
