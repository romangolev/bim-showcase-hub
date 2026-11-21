import { describe, expect, it } from 'vitest';
import { MAX_LOADED_MEMBERS } from '../../shared/combined.js';
import { forgetPersonal, isPersonalKey } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import type { ViewerState } from '../viewer/ViewerAdapter.js';
import { MODEL_STORE_KEY } from './modelStore.js';
import {
  activateModel,
  addToModel,
  claimModels,
  closeModel,
  closeOtherModels,
  createOpenModelsStore,
  EMPTY_OPEN_MODELS,
  keepOnlyModel,
  LAST_SESSION_KEY,
  liveWeight,
  MAX_CLOSED_TABS,
  MODEL_OWNER_KEY,
  OPEN_MODELS_KEY,
  type OpenModelsPersist,
  type OpenModelsState,
  openModel,
  ownerKey,
  parseOpenModels,
  removeFromModel,
  serializeOpenModels,
  setModelView,
  setVisible,
  touchLive,
} from './openModels.js';

function memoryPersist(value: OpenModelsState): OpenModelsPersist & {
  value: OpenModelsState;
  removed: boolean;
} {
  const memory = {
    value,
    removed: false,
    read: () => memory.value,
    write: (next: OpenModelsState) => {
      memory.value = next;
      return true;
    },
    remove: () => {
      memory.removed = true;
    },
  };
  return memory;
}

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
    createOpenModelsStore().open('a', { file: 'A.rvt' });
  }

  it('keeps the models of the same user', () => {
    const storage = installMemoryStorage();
    expect(claimModels({ id: 'u1', name: 'Ada' })).toBe(false);
    seed(storage);
    expect(claimModels({ id: 'u1', name: 'Ada' })).toBe(false);
    expect(storage.getItem(MODEL_STORE_KEY)).not.toBeNull();
    expect(createOpenModelsStore().getState().models).toHaveLength(1);
  });

  it('forgets open and recent models when another user signs in', () => {
    const storage = installMemoryStorage();
    claimModels({ id: 'u1', name: 'Ada' });
    seed(storage);
    expect(claimModels({ id: 'u2', name: 'Grace' })).toBe(true);
    expect(storage.getItem(MODEL_STORE_KEY)).toBeNull();
    expect(sessionStorage.getItem(OPEN_MODELS_KEY)).toBeNull();
    expect(createOpenModelsStore().getState().models).toEqual([]);
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
    expect(createOpenModelsStore().getState().models).toEqual([]);
  });

  it('keeps the data of a name-keyed owner when the id first appears', () => {
    const storage = installMemoryStorage();
    storage.setItem(MODEL_OWNER_KEY, 'Ada');
    seed(storage);
    expect(claimModels({ id: 'u1', name: 'Ada' })).toBe(false);
    expect(storage.getItem(MODEL_STORE_KEY)).not.toBeNull();
    expect(storage.getItem(MODEL_OWNER_KEY)).toBe('id:u1');
    expect(claimModels({ id: 'u1', name: 'Ada' })).toBe(false);
    expect(createOpenModelsStore().getState().models).toHaveLength(1);
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
    storage.setItem('bsh.docs.pinned', '["a"]');
    forgetPersonal();
    expect(storage.getItem('bsh.docs.pinned')).toBeNull();
    expect(storage.getItem(MODEL_OWNER_KEY)).toBeNull();
    expect(storage.getItem(MODEL_STORE_KEY)).toBeNull();
    expect(sessionStorage.getItem(OPEN_MODELS_KEY)).toBeNull();
  });

  it('clears a live store', () => {
    installMemoryStorage();
    const store = createOpenModelsStore();
    store.open('a');
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    store.clear();
    expect(store.getState()).toEqual(EMPTY_OPEN_MODELS);
    expect(sessionStorage.getItem(OPEN_MODELS_KEY)).toBeNull();
    expect(calls).toBe(1);
    forgetPersonal();
  });
});

describe('open models persistence', () => {
  it('restores tabs and the active one without loading any', () => {
    installMemoryStorage();
    const first = createOpenModelsStore();
    first.open('a', { file: 'A.rvt' });
    first.open('b', { file: 'B.rvt' });
    first.activate('a');
    const second = createOpenModelsStore();
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
    const store = createOpenModelsStore();
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
    installMemoryStorage();
    createOpenModelsStore().open('a', { v: 'v1' });
    expect(JSON.parse(sessionStorage.getItem(OPEN_MODELS_KEY) ?? '{}')).toEqual(
      {
        models: [{ urn: 'a', context: { v: 'v1' } }],
        active: 'a',
      },
    );
  });
});

describe('tab view state', () => {
  const state: ViewerState = {
    version: 1,
    camera: null,
    cutplanes: [],
    explode: 0.2,
    models: {},
  };

  it('stores, serializes and parses a tab state', () => {
    const opened = openModel(EMPTY_OPEN_MODELS, 'u1');
    const next = setModelView(opened, 'u1', { state });
    expect(parseOpenModels(serializeOpenModels(next)).models[0]?.state).toEqual(
      state,
    );
  });

  it('turning remember off drops the state and stays off after a reload', () => {
    const opened = setModelView(openModel(EMPTY_OPEN_MODELS, 'u1'), 'u1', {
      state,
    });
    const off = setModelView(opened, 'u1', { remember: false });
    const parsed = parseOpenModels(serializeOpenModels(off)).models[0];
    expect(parsed?.state).toBeUndefined();
    expect(parsed?.remember).toBe(false);
    expect(setModelView(off, 'u1', { state }).models[0]?.state).toBeUndefined();
  });

  it('keeps the state and remember flag on a tab that loses a member', () => {
    const combined = setModelView(
      openModel(EMPTY_OPEN_MODELS, 'u1', { with: 'u2' }),
      'u1',
      { state },
    );
    const single = removeFromModel(combined, 'u1', 'u2');
    expect(single.models[0]).toMatchObject({ urn: 'u1', state });
    const off = setModelView(combined, 'u1', { remember: false });
    expect(removeFromModel(off, 'u1', 'u2').models[0]?.remember).toBe(false);
  });

  it('ignores a corrupt stored state', () => {
    const raw = JSON.stringify({
      models: [{ urn: 'u1', context: {}, state: { version: 9 } }],
      active: 'u1',
    });
    expect(parseOpenModels(raw).models[0]?.state).toBeUndefined();
  });

  it('reads remember and pinned only when they are the exact flag', () => {
    const raw = JSON.stringify({
      models: [
        { urn: 'u1', context: {}, remember: false, pinned: true },
        { urn: 'u2', context: {}, remember: 'no', pinned: 1 },
      ],
      active: 'u1',
    });
    const [first, second] = parseOpenModels(raw).models;
    expect(first).toMatchObject({ remember: false, pinned: true });
    expect(second).not.toHaveProperty('remember');
    expect(second).not.toHaveProperty('pinned');
  });

  it('persists a state change through the store', () => {
    const memory = {
      value: EMPTY_OPEN_MODELS,
      read: () => memory.value,
      write: (value: OpenModelsState) => {
        memory.value = value;
        return true;
      },
      remove: () => {},
    };
    const store = createOpenModelsStore(memory);
    store.open('u1');
    store.setView('u1', { state });
    expect(memory.value.models[0]?.state).toEqual(state);
  });
});

describe('pinned tabs', () => {
  it('never pauses a pinned tab for the loaded budget', () => {
    let state = openModel(EMPTY_OPEN_MODELS, 'a', {}, 2);
    state = setModelView(state, 'a', { pinned: true });
    state = openModel(state, 'b', {}, 2);
    state = openModel(state, 'c', {}, 2);
    expect(state.live).toContain('a');
    expect(state.live).toContain('c');
    expect(state.live).not.toContain('b');
  });

  it('keeps the pin when a member is dropped from a combined tab', () => {
    let state = openModel(EMPTY_OPEN_MODELS, 'u1', { with: 'u2' });
    state = setModelView(state, 'u1', { pinned: true });
    const single = removeFromModel(state, 'u1', 'u2');
    expect(single.models[0]).toMatchObject({ urn: 'u1', pinned: true });
    expect(single.models[0]).not.toHaveProperty('pinned', false);
  });
});

describe('close others and reopen', () => {
  it('closes every unpinned tab except the chosen one', () => {
    let state = ['a', 'b', 'c'].reduce(
      (next, urn) => openModel(next, urn),
      EMPTY_OPEN_MODELS,
    );
    state = setModelView(state, 'a', { pinned: true });
    const next = closeOtherModels(state, 'c');
    expect(next.models.map((model) => model.urn)).toEqual(['a', 'c']);
    expect(next.active).toBe('c');
  });

  it('leaves the state alone when every other tab is pinned', () => {
    let state = openModel(EMPTY_OPEN_MODELS, 'a');
    state = openModel(state, 'b');
    state = setModelView(state, 'a', { pinned: true });
    expect(closeOtherModels(state, 'b')).toBe(state);
  });

  it('reopens closed tabs newest first with their context and state', () => {
    const store = createOpenModelsStore(null);
    store.open('a', { file: 'A.rvt' });
    store.open('b');
    store.setView('a', {
      state: { version: 1, camera: null, cutplanes: [], models: {} },
    });
    store.close('a');
    store.close('b');
    expect(store.reopenClosed()).toBe('b');
    expect(store.reopenClosed()).toBe('a');
    expect(
      store.getState().models.find((model) => model.urn === 'a')?.context.file,
    ).toBe('A.rvt');
    expect(
      store.getState().models.find((model) => model.urn === 'a')?.state,
    ).toBeDefined();
    expect(store.getState().active).toBe('a');
    expect(store.canReopen()).toBe(false);
  });

  it('closes the other tabs through the store and keeps the pinned ones', () => {
    const store = createOpenModelsStore(null);
    store.open('a');
    store.open('b');
    store.open('c');
    store.setView('a', { pinned: true });
    store.closeOthers('c');
    expect(store.getState().models.map((model) => model.urn)).toEqual([
      'a',
      'c',
    ]);
    expect(store.reopenClosed()).toBe('b');
  });

  it('remembers the tabs that Keep only closes', () => {
    const store = createOpenModelsStore(null);
    store.open('a');
    store.open('b');
    store.keepOnly('a');
    expect(store.canReopen()).toBe(true);
    expect(store.reopenClosed()).toBe('b');
  });

  it('keeps at most ten closed tabs', () => {
    const store = createOpenModelsStore(null);
    for (let index = 0; index < MAX_CLOSED_TABS + 2; index += 1) {
      store.open(`t${index}`);
      store.close(`t${index}`);
    }
    let reopened = 0;
    while (store.reopenClosed()) reopened += 1;
    expect(reopened).toBe(MAX_CLOSED_TABS);
  });

  it('empties the closed stack when the store is cleared', () => {
    const store = createOpenModelsStore(null);
    store.open('a');
    store.open('b');
    store.close('b');
    store.clear();
    expect(store.canReopen()).toBe(false);
    expect(store.reopenClosed()).toBeNull();
  });
});

describe('last session', () => {
  it('seeds from the last session when the tab session is empty', () => {
    const session = memoryPersist(EMPTY_OPEN_MODELS);
    const last = memoryPersist(
      openModel(EMPTY_OPEN_MODELS, 'u1', { file: 'A.rvt' }),
    );
    const store = createOpenModelsStore(session, 8, () => ({}), last);
    expect(store.getState().models.map((model) => model.urn)).toEqual(['u1']);
    expect(session.value.models.map((model) => model.urn)).toEqual(['u1']);
  });

  it('does not seed over a tab session that already has tabs', () => {
    const session = memoryPersist(openModel(EMPTY_OPEN_MODELS, 'open'));
    const last = memoryPersist(openModel(EMPTY_OPEN_MODELS, 'last'));
    const store = createOpenModelsStore(session, 8, () => ({}), last);
    expect(store.getState().models.map((model) => model.urn)).toEqual(['open']);
  });

  it('writes the last session without view state and clears it with the store', () => {
    const last = memoryPersist(EMPTY_OPEN_MODELS);
    const store = createOpenModelsStore(
      memoryPersist(EMPTY_OPEN_MODELS),
      8,
      () => ({}),
      last,
    );
    store.open('u1');
    store.setView('u1', {
      state: { version: 1, camera: null, cutplanes: [], models: {} },
    });
    expect(last.value.models[0]?.state).toBeUndefined();
    expect(last.value.models[0]?.urn).toBe('u1');
    store.clear();
    expect(last.removed).toBe(true);
  });

  it('treats the last session key as personal', () => {
    expect(isPersonalKey(LAST_SESSION_KEY)).toBe(true);
    expect(LAST_SESSION_KEY).toBe('bsh.models.session.v1');
  });
});
