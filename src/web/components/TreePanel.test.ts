import { beforeEach, describe, expect, it } from 'vitest';
import {
  contextOf,
  createOpenModelsStore,
  modelUrnsOf,
} from '../api/openModels.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { openAsTab, openPickedAsTabs, openWithMode } from './TreePanel.js';

const picked = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    urn: `urn-${index}`,
    context: { file: `Model ${index}.rvt`, v: `v${index}` },
  }));

beforeEach(() => {
  installMemoryStorage();
});

describe('openPickedAsTabs', () => {
  it('opens each picked model as its own tab', () => {
    const store = createOpenModelsStore(null);
    const opened = openPickedAsTabs(store, picked(3));
    expect(opened).toHaveLength(3);
    expect(store.getState().models.map((model) => model.urn)).toEqual([
      'urn-0',
      'urn-1',
      'urn-2',
    ]);
    expect(store.getState().active).toBe('urn-2');
  });

  it('admits at most the loaded-model limit', () => {
    const store = createOpenModelsStore(null);
    openPickedAsTabs(store, picked(10));
    expect(store.getState().models).toHaveLength(8);
  });
});

describe('openWithMode', () => {
  const state = (store: ReturnType<typeof createOpenModelsStore>) =>
    store.getState();

  it('adds a new tab by default', () => {
    const store = createOpenModelsStore(null);
    store.open('urn-a', { file: 'A.rvt' });
    const target = openWithMode('tab', store, state(store), 'urn-b', {
      file: 'B.rvt',
    });
    expect(target.urn).toBe('urn-b');
    expect(store.getState().models.map((model) => model.urn)).toEqual([
      'urn-a',
      'urn-b',
    ]);
  });

  it('replaces the active tab', () => {
    const store = createOpenModelsStore(null);
    store.open('urn-a', { file: 'A.rvt' });
    store.open('urn-b', { file: 'B.rvt' });
    const target = openWithMode('replace', store, state(store), 'urn-c', {
      file: 'C.rvt',
    });
    expect(target.urn).toBe('urn-c');
    expect(store.getState().models.map((model) => model.urn)).toEqual([
      'urn-a',
      'urn-c',
    ]);
    expect(store.getState().active).toBe('urn-c');
  });

  it('combines with the open viewer', () => {
    const store = createOpenModelsStore(null);
    store.open('urn-a', { file: 'A.rvt' });
    store.open('urn-b', { file: 'B.rvt' });
    const target = openWithMode('combined', store, state(store), 'urn-c', {
      file: 'C.rvt',
    });
    expect(target.urn).toBe('urn-b');
    expect(modelUrnsOf(store.getState(), 'urn-b')).toEqual(['urn-b', 'urn-c']);
    expect(contextOf(store.getState(), 'urn-b')?.with).toBe('urn-c');
  });

  it('opens a new tab and says so when the combined viewer is full', () => {
    const store = createOpenModelsStore(null);
    store.open('urn-a', { file: 'A.rvt' });
    for (let index = 1; index < 6; index += 1) {
      store.addTo('urn-a', `urn-extra-${index}`);
    }
    expect(modelUrnsOf(store.getState(), 'urn-a')).toHaveLength(6);
    const target = openWithMode('combined', store, state(store), 'urn-new', {
      file: 'New.rvt',
    });
    expect(target.urn).toBe('urn-new');
    expect(target.notice).toBe('The open viewer is full; opened a new tab');
    expect(modelUrnsOf(store.getState(), 'urn-a')).toHaveLength(6);
    expect(store.getState().models.map((model) => model.urn)).toEqual([
      'urn-a',
      'urn-new',
    ]);
    expect(store.getState().active).toBe('urn-new');
  });

  it('says which combined tab it closed when replacing one', () => {
    const store = createOpenModelsStore(null);
    store.open('urn-a', { file: 'A.rvt' });
    store.open('urn-b', { file: 'B.rvt' });
    store.addTo('urn-b', 'urn-c');
    store.addTo('urn-b', 'urn-d');
    const target = openWithMode('replace', store, state(store), 'urn-e', {
      file: 'E.rvt',
    });
    expect(target.urn).toBe('urn-e');
    expect(target.notice).toBe('Closed the combined tab and its 3 models');
    expect(store.getState().models.map((model) => model.urn)).toEqual([
      'urn-a',
      'urn-e',
    ]);
  });

  it('says nothing when replacing a single tab', () => {
    const store = createOpenModelsStore(null);
    store.open('urn-a', { file: 'A.rvt' });
    const target = openWithMode('replace', store, state(store), 'urn-b', {
      file: 'B.rvt',
    });
    expect(target.notice).toBeUndefined();
  });
});

describe('openAsTab', () => {
  it('opens its own tab beside a combined viewer', () => {
    const store = createOpenModelsStore(null);
    store.open('urn-a', { file: 'A.rvt' });
    store.open('urn-b', { file: 'B.rvt' });
    store.addTo('urn-b', 'urn-c');
    const target = openAsTab(store, 'urn-d', { file: 'D.rvt' });
    expect(target.urn).toBe('urn-d');
    expect(modelUrnsOf(store.getState(), 'urn-b')).toEqual(['urn-b', 'urn-c']);
    expect(store.getState().models.map((model) => model.urn)).toEqual([
      'urn-a',
      'urn-b',
      'urn-d',
    ]);
    expect(store.getState().active).toBe('urn-d');
  });

  it('leaves the active tab open', () => {
    const store = createOpenModelsStore(null);
    store.open('urn-a', { file: 'A.rvt' });
    openAsTab(store, 'urn-b', { file: 'B.rvt' });
    expect(store.getState().models.map((model) => model.urn)).toEqual([
      'urn-a',
      'urn-b',
    ]);
  });
});
