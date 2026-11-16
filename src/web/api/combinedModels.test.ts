import { beforeEach, describe, expect, it } from 'vitest';
import { modelTabTitle } from '../routes/ModelPage.js';
import {
  joinWith,
  parseModelContext,
  parseWith,
  sameModelContext,
  withUrns,
} from './modelContext.js';
import { recallModel, rememberModel } from './modelStore.js';
import {
  addToModel,
  createOpenModelsStore,
  EMPTY_OPEN_MODELS,
  modelUrnsOf,
  type OpenModelsState,
  openModel,
  parseOpenModels,
  removeFromModel,
  serializeOpenModels,
  tabHolding,
} from './openModels.js';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

let session: Storage;

beforeEach(() => {
  session = memoryStorage();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: memoryStorage(),
  });
});

function open(
  state: OpenModelsState,
  urn: string,
  context = {},
): OpenModelsState {
  return openModel(state, urn, context);
}

describe('with in the model context', () => {
  it('parses a comma list, drops repeats and empties, and caps it', () => {
    expect(parseWith('b,c,,b, d')).toEqual(['b', 'c', 'd']);
    expect(parseWith(['b', 'a', 'c'], 'a')).toEqual(['b', 'c']);
    expect(parseWith('1,2,3,4,5,6,7')).toHaveLength(5);
    expect(parseWith(42)).toEqual([]);
    expect(joinWith([])).toBeUndefined();
    expect(joinWith(['b', 'c'])).toBe('b,c');
  });

  it('round-trips through the route search and compares', () => {
    const context = parseModelContext({ file: 'A.rvt', with: 'b,c' });
    expect(context).toEqual({ file: 'A.rvt', with: 'b,c' });
    expect(withUrns(context)).toEqual(['b', 'c']);
    expect(sameModelContext(context, { file: 'A.rvt' })).toBe(false);
  });

  it('never remembers or recalls the with list per urn', () => {
    rememberModel('a', { file: 'A.rvt', with: 'b' });
    expect(recallModel('a')).toEqual({ file: 'A.rvt' });
  });
});

describe('combined entries in the open-models store', () => {
  it('opens a combined tab as one entry and keeps its members', () => {
    let state = open(EMPTY_OPEN_MODELS, 'a', { file: 'A.rvt', with: 'b,a,c' });
    expect(state.models).toEqual([
      { urn: 'a', context: { file: 'A.rvt', with: 'b,c' } },
    ]);
    state = open(state, 'a', { file: 'A.rvt', v: 'v2' });
    expect(state.models[0]?.context).toEqual({
      file: 'A.rvt',
      v: 'v2',
      with: 'b,c',
    });
    state = open(state, 'a', { with: 'c' });
    expect(withUrns(state.models[0]?.context)).toEqual(['c']);
    expect(modelUrnsOf(state, 'a')).toEqual(['a', 'c']);
    expect(tabHolding(state, 'c')).toBe('a');
    expect(tabHolding(state, 'x')).toBeNull();
  });

  it('adds members once and up to six models', () => {
    let state = open(EMPTY_OPEN_MODELS, 'a');
    state = addToModel(state, 'a', 'b');
    expect(addToModel(state, 'a', 'b')).toBe(state);
    expect(addToModel(state, 'a', 'a')).toBe(state);
    for (const urn of ['c', 'd', 'e', 'f']) state = addToModel(state, 'a', urn);
    expect(modelUrnsOf(state, 'a')).toHaveLength(6);
    expect(addToModel(state, 'a', 'g')).toBe(state);
    expect(addToModel(state, 'missing', 'g')).toBe(state);
  });

  it('removes a member, re-keys when the first model goes, closes when empty', () => {
    let state = open(EMPTY_OPEN_MODELS, 'a', { file: 'A.rvt', with: 'b,c' });
    state = removeFromModel(state, 'a', 'b');
    expect(modelUrnsOf(state, 'a')).toEqual(['a', 'c']);
    state = removeFromModel(state, 'a', 'a', (urn) => ({
      file: `${urn.toUpperCase()}.rvt`,
    }));
    expect(state.models).toEqual([{ urn: 'c', context: { file: 'C.rvt' } }]);
    expect(state.active).toBe('c');
    expect(state.live).toEqual(['c']);
    state = removeFromModel(state, 'c', 'c');
    expect(state.models).toEqual([]);
    expect(state.active).toBeNull();
  });

  it('closes instead of re-keying onto a urn that has its own tab', () => {
    let state = open(EMPTY_OPEN_MODELS, 'b');
    state = open(state, 'a', { with: 'b' });
    state = removeFromModel(state, 'a', 'a');
    expect(state.models.map((model) => model.urn)).toEqual(['b']);
  });

  it('persists the members and restores them lazily', () => {
    const store = createOpenModelsStore(session);
    store.open('a', { file: 'A.rvt' });
    store.addTo('a', 'b');
    const restored = parseOpenModels(session.getItem('bsh.models.open'));
    expect(restored.models).toEqual([
      { urn: 'a', context: { file: 'A.rvt', with: 'b' } },
    ]);
    expect(restored.live).toEqual([]);
    expect(serializeOpenModels(restored)).toContain('"with":"b"');
    store.removeFrom('a', 'b');
    expect(store.getState().models[0]?.context).toEqual({ file: 'A.rvt' });
  });
});

describe('combined tab title', () => {
  it('names the count and lists the files in the tooltip', () => {
    rememberModel('b', { file: 'B.rvt', v: 'v3' });
    const title = modelTabTitle('a', { file: 'A.rvt', v: 'v1', with: 'b,c' });
    expect(title.label).toBe('3 models');
    expect(title.tooltip.split('\n')).toEqual([
      'A.rvt · v1',
      'B.rvt · v3',
      'Untitled model',
    ]);
    expect(modelTabTitle('a', { file: 'A.rvt' }).label).toBe('A.rvt');
  });
});

describe('positions of a combined tab', () => {
  it('saves offsets and spread with the entry and restores them', () => {
    const store = createOpenModelsStore(session);
    store.open('a', { file: 'A.rvt', with: 'b,c' });
    store.setView('a', { offsets: { b: [1, 2, 3] }, spread: 423_000 });
    const restored = parseOpenModels(session.getItem('bsh.models.open'));
    expect(restored.models[0]).toMatchObject({
      urn: 'a',
      offsets: { b: [1, 2, 3] },
      spread: 423_000,
    });
    store.open('a', { file: 'A.rvt', v: 'v2' });
    expect(store.getState().models[0]?.offsets).toEqual({ b: [1, 2, 3] });
    store.addTo('a', 'd');
    expect(store.getState().models[0]?.offsets).toEqual({ b: [1, 2, 3] });
    store.removeFrom('a', 'b');
    expect(store.getState().models[0]?.offsets).toBeUndefined();
    store.setView('a', { offsets: { c: [4, 5, 6] } });
    store.removeFrom('a', 'a');
    expect(store.getState().models[0]).toMatchObject({ urn: 'c' });
    expect(store.getState().models[0]?.offsets).toBeUndefined();
  });

  it('ignores malformed saved offsets', () => {
    const state = parseOpenModels(
      JSON.stringify({
        models: [{ urn: 'a', context: {}, offsets: { b: [1, 'x', 3] } }],
      }),
    );
    expect(state.models[0]?.offsets).toBeUndefined();
  });

  it('adds the far apart warning to the tab tooltip', () => {
    const title = modelTabTitle(
      'a',
      { file: 'A.rvt', with: 'b' },
      undefined,
      423_672,
    );
    expect(title.tooltip).toContain(
      'Some models are far apart in model space (about 424 km).',
    );
  });
});
