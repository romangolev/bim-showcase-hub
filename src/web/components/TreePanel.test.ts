import { beforeEach, describe, expect, it } from 'vitest';
import {
  contextOf,
  createOpenModelsStore,
  modelUrnsOf,
} from '../api/openModels.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { openPickedAsTabs, openWithMode } from './TreePanel.js';

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
});
