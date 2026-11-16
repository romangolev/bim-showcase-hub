import { describe, expect, it } from 'vitest';
import { MAX_LOADED_MEMBERS } from '../../shared/combined.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { MODEL_STORE_KEY } from './modelStore.js';
import {
  activateModel,
  addToModel,
  claimModels,
  closeModel,
  createOpenModelsStore,
  EMPTY_OPEN_MODELS,
  forgetModels,
  keepOnlyModel,
  liveWeight,
  MODEL_OWNER_KEY,
  OPEN_MODELS_KEY,
  type OpenModelsState,
  openModel,
  ownerKey,
  parseOpenModels,
  setVisible,
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
    expect(state).toEqual(EMPTY_OPEN_MODELS);
  });

  it('suspends the least recently shown model above the cap', () => {
    const urns = Array.from(
      { length: MAX_LOADED_MEMBERS + 1 },
      (_, index) => `m${index}`,
    );
    const state = openAll(...urns);
    expect(state.live).toHaveLength(MAX_LOADED_MEMBERS);
    expect(state.live).not.toContain('m0');
    expect(state.models).toHaveLength(MAX_LOADED_MEMBERS + 1);
    const back = activateModel(state, 'm0');
    expect(back.live).toContain('m0');
    expect(back.live).not.toContain('m1');
  });

  it('weights the loaded budget by the models each tab holds', () => {
    const combined = (urn: string, members: string[]) =>
      ({ file: `${urn}.rvt`, with: members.join(',') }) as const;
    let state = openModel(
      EMPTY_OPEN_MODELS,
      'a',
      combined('a', ['a2', 'a3', 'a4', 'a5', 'a6']),
    );
    expect(liveWeight(state, 'a')).toBe(6);
    state = openModel(state, 'b', { file: 'b.rvt' });
    state = openModel(state, 'c', { file: 'c.rvt' });
    expect(state.live).toEqual(['a', 'b', 'c']);
    state = openModel(state, 'd', combined('d', ['d2', 'd3']));
    expect(state.live).toEqual(['b', 'c', 'd']);
    state = activateModel(state, 'a');
    expect(state.live).toEqual(['a']);
  });

  it('keeps a single tab larger than the budget and the visible tabs', () => {
    let state = openModel(EMPTY_OPEN_MODELS, 'a', {
      with: 'a2,a3,a4,a5,a6',
    });
    state = setVisible(state, ['a']);
    state = openModel(state, 'b', { with: 'b2,b3,b4,b5,b6' });
    expect(state.live).toEqual(['a', 'b']);
    state = setVisible(state, ['a', 'b']);
    state = touchLive(state, 'b', 4);
    expect(state.live).toEqual(['a', 'b']);
    state = setVisible(state, ['b']);
    state = touchLive(state, 'b', 4);
    expect(state.live).toEqual(['b']);
  });

  it('pauses a background tab when a member is added over the budget', () => {
    let state = openAll('x', 'y', 'z');
    state = openModel(state, 'a', { with: 'a2,a3,a4,a5' });
    expect(state.live).toEqual(['x', 'y', 'z', 'a']);
    state = addToModel(state, 'a', 'a6');
    expect(state.live).toEqual(['y', 'z', 'a']);
  });

  it('never suspends the active model when a background tab is shown', () => {
    let state = openAll('a', 'b', 'c');
    state = activateModel(state, 'a');
    state = touchLive(state, 'b', 2);
    expect(state.live).toEqual(['a', 'b']);
    expect(state.active).toBe('a');
  });

  it('never suspends a model that is visible in another group', () => {
    let state = openAll('a', 'b', 'c');
    state = setVisible(state, ['a', 'b']);
    state = activateModel(state, 'c', 2);
    expect(state.live).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    state = setVisible(state, ['c']);
    state = activateModel(state, 'a', 2);
    expect(state.live).toEqual(['c', 'a']);
  });

  it('loads the neighbour that becomes active when the active tab closes', () => {
    let state: OpenModelsState = {
      ...openAll('a', 'b', 'c'),
      live: ['c'],
    };
    state = closeModel(state, 'c', 1);
    expect(state.active).toBe('b');
    expect(state.live).toEqual(['b']);
  });

  it('keeps only one model, active and not yet loaded', () => {
    const state = keepOnlyModel(openAll('a', 'b', 'c'), 'b');
    expect(state).toEqual({
      models: [{ urn: 'b', context: { file: 'b.rvt' } }],
      active: 'b',
      live: [],
      visible: [],
    });
    expect(keepOnlyModel(state, 'zzz')).toBe(state);
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
    expect(claimModels({ id: 'u1', name: 'Ada' })).toBe(false);
    seed(storage);
    expect(claimModels({ id: 'u1', name: 'Ada' })).toBe(false);
    expect(storage.getItem(MODEL_STORE_KEY)).not.toBeNull();
    expect(
      createOpenModelsStore(sessionStorage).getState().models,
    ).toHaveLength(1);
  });

  it('forgets open and recent models when another user signs in', () => {
    const storage = installMemoryStorage();
    claimModels({ id: 'u1', name: 'Ada' });
    seed(storage);
    expect(claimModels({ id: 'u2', name: 'Grace' })).toBe(true);
    expect(storage.getItem(MODEL_STORE_KEY)).toBeNull();
    expect(sessionStorage.getItem(OPEN_MODELS_KEY)).toBeNull();
    expect(createOpenModelsStore(sessionStorage).getState().models).toEqual([]);
    expect(storage.getItem(MODEL_OWNER_KEY)).toBe(
      ownerKey({ id: 'u2', name: 'Grace' }),
    );
  });

  it('does not share models between two users with the same name', () => {
    const storage = installMemoryStorage();
    claimModels({ id: 'u1', name: 'Sam' });
    seed(storage);
    expect(claimModels({ id: 'u2', name: 'Sam' })).toBe(true);
    expect(storage.getItem(MODEL_STORE_KEY)).toBeNull();
    expect(createOpenModelsStore(sessionStorage).getState().models).toEqual([]);
  });

  it('keeps the data of a name-keyed owner when the id first appears', () => {
    const storage = installMemoryStorage();
    storage.setItem(MODEL_OWNER_KEY, 'Ada');
    seed(storage);
    expect(claimModels({ id: 'u1', name: 'Ada' })).toBe(false);
    expect(storage.getItem(MODEL_STORE_KEY)).not.toBeNull();
    expect(storage.getItem(MODEL_OWNER_KEY)).toBe('id:u1');
    expect(claimModels({ id: 'u1', name: 'Ada' })).toBe(false);
    expect(
      createOpenModelsStore(sessionStorage).getState().models,
    ).toHaveLength(1);
    storage.setItem(MODEL_OWNER_KEY, 'name:Ada');
    expect(claimModels({ id: 'u9', name: 'Grace' })).toBe(true);
  });

  it('falls back to the name when the id is missing', () => {
    const storage = installMemoryStorage();
    claimModels({ name: 'Ada' });
    seed(storage);
    expect(claimModels({ name: 'Ada' })).toBe(false);
    expect(storage.getItem(MODEL_OWNER_KEY)).toBe('name:Ada');
    expect(claimModels({ name: 'Grace' })).toBe(true);
  });

  it('forgets the owner on sign-out', () => {
    const storage = installMemoryStorage();
    claimModels({ id: 'u1', name: 'Ada' });
    seed(storage);
    forgetModels();
    expect(storage.getItem(MODEL_OWNER_KEY)).toBeNull();
    expect(storage.getItem(MODEL_STORE_KEY)).toBeNull();
    expect(sessionStorage.getItem(OPEN_MODELS_KEY)).toBeNull();
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
