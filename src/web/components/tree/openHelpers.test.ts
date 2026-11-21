import { describe, expect, it } from 'vitest';
import {
  addToModel,
  createOpenModelsStore,
  EMPTY_OPEN_MODELS,
  modelUrnsOf,
  openModel,
} from '../../api/openModels.js';
import { canJoinTab, openWithMode } from './openHelpers.js';

function combinedStore() {
  const store = createOpenModelsStore(null);
  store.open('a', { file: 'A' });
  store.addTo('a', 'b');
  return store;
}

describe('opening a member of a combined tab', () => {
  it('opens it as its own tab in combined mode', () => {
    const store = combinedStore();
    const target = openWithMode('combined', store, store.getState(), 'b', {
      file: 'B',
    });
    expect(target.urn).toBe('b');
    expect(store.getState().models.map((model) => model.urn)).toEqual([
      'a',
      'b',
    ]);
    expect(store.getState().active).toBe('b');
    expect(modelUrnsOf(store.getState(), 'a')).toEqual(['a', 'b']);
  });

  it('still adds a fresh model to the combined tab', () => {
    const store = combinedStore();
    const target = openWithMode('combined', store, store.getState(), 'c', {});
    expect(target.urn).toBe('a');
    expect(modelUrnsOf(store.getState(), 'a')).toEqual(['a', 'b', 'c']);
  });

  it('leaves the combined tab unchanged when opened as a tab in the store', () => {
    const state = openModel(
      addToModel(openModel(EMPTY_OPEN_MODELS, 'a'), 'a', 'b'),
      'b',
    );
    expect(state.models.map((model) => model.urn)).toEqual(['a', 'b']);
    expect(state.active).toBe('b');
  });
});

describe('joining the open viewer', () => {
  const state = () => {
    const store = createOpenModelsStore(null);
    store.open('x', {});
    store.open('y', {});
    store.open('c', {});
    store.addTo('c', 'm');
    store.activate('x');
    return store.getState();
  };

  it.each([
    ['a fresh model', 'x', 'n', true],
    ['a model that is its own tab', 'x', 'y', false],
    ['a model already in the target', 'c', 'm', false],
    ['the target itself', 'x', 'x', false],
  ])('%s', (_name, target, urn, expected) => {
    expect(canJoinTab(state(), target, urn)).toBe(expected);
  });
});
