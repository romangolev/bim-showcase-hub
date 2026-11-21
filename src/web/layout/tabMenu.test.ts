import { describe, expect, it } from 'vitest';
import {
  createOpenModelsStore,
  type OpenModelsStore,
} from '../api/openModels.js';
import type { MenuEntry } from '../components/Menu.js';
import { modelTabEntries } from './tabMenu.js';

type TabEntry = Exclude<MenuEntry, { kind: 'separator' }>;

function tabEntry(store: OpenModelsStore, urn: string, id: string): TabEntry {
  const entry = modelTabEntries(store, store.getState(), urn).find(
    (candidate) => candidate.kind !== 'separator' && candidate.id === id,
  );
  if (!entry || entry.kind === 'separator') throw new Error(`no ${id} entry`);
  return entry;
}

function rememberEntry(store: OpenModelsStore, urn: string): TabEntry {
  return tabEntry(store, urn, 'tab.remember');
}

describe('modelTabEntries', () => {
  it('toggles remember off and on for one tab', () => {
    const store = createOpenModelsStore(null);
    store.open('u1');
    expect(rememberEntry(store, 'u1')).toMatchObject({
      id: 'tab.remember',
      label: 'Remember view state',
      checked: true,
    });
    rememberEntry(store, 'u1').onSelect();
    expect(store.getState().models[0]?.remember).toBe(false);
    expect(rememberEntry(store, 'u1').checked).toBe(false);
    rememberEntry(store, 'u1').onSelect();
    expect(store.getState().models[0]?.remember).toBeUndefined();
  });

  it('explains what the state keeps', () => {
    const store = createOpenModelsStore(null);
    store.open('u1');
    expect(rememberEntry(store, 'u1').description).toContain(
      'Measurements are not kept',
    );
  });

  it('pins and unpins one tab', () => {
    const store = createOpenModelsStore(null);
    store.open('u1');
    expect(tabEntry(store, 'u1', 'tab.pin')).toMatchObject({
      label: 'Pin tab',
      checked: false,
    });
    tabEntry(store, 'u1', 'tab.pin').onSelect();
    expect(store.getState().models[0]?.pinned).toBe(true);
    expect(tabEntry(store, 'u1', 'tab.pin').checked).toBe(true);
    tabEntry(store, 'u1', 'tab.pin').onSelect();
    expect(store.getState().models[0]?.pinned).toBeUndefined();
  });

  it('says that a pinned tab is never paused', () => {
    const store = createOpenModelsStore(null);
    store.open('u1');
    expect(tabEntry(store, 'u1', 'tab.pin').description).toContain(
      'never paused',
    );
  });

  it('closes the other tabs and keeps the pinned ones', () => {
    const store = createOpenModelsStore(null);
    store.open('a');
    store.open('b');
    store.open('c');
    store.setView('a', { pinned: true });
    store.closeOthers('c');
    tabEntry(store, 'c', 'tab.closeOthers').onSelect();
    expect(store.getState().models.map((model) => model.urn)).toEqual([
      'a',
      'c',
    ]);
  });

  it('disables close others when every other tab is pinned', () => {
    const store = createOpenModelsStore(null);
    store.open('a');
    store.open('b');
    store.setView('a', { pinned: true });
    expect(tabEntry(store, 'b', 'tab.closeOthers')).toMatchObject({
      disabled: true,
      description: 'No other unpinned tabs',
    });
  });

  it('reopens the last closed tab', () => {
    const store = createOpenModelsStore(null);
    store.open('a');
    store.open('b');
    expect(tabEntry(store, 'b', 'tab.reopen')).toMatchObject({
      disabled: true,
      description: 'No closed tabs',
    });
    store.close('a');
    expect(tabEntry(store, 'b', 'tab.reopen').disabled).toBeUndefined();
    tabEntry(store, 'b', 'tab.reopen').onSelect();
    expect(store.getState().models.map((model) => model.urn)).toEqual([
      'b',
      'a',
    ]);
  });

  it('has no entries for a urn that is not open', () => {
    const store = createOpenModelsStore(null);
    store.open('u1');
    expect(modelTabEntries(store, store.getState(), 'zzz')).toEqual([]);
  });
});
