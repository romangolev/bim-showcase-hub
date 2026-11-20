import { describe, expect, it } from 'vitest';
import {
  createOpenModelsStore,
  type OpenModelsStore,
} from '../api/openModels.js';
import type { MenuEntry } from '../components/Menu.js';
import { modelTabEntries } from './tabMenu.js';

type TabEntry = Exclude<MenuEntry, { kind: 'separator' }>;

function rememberEntry(store: OpenModelsStore, urn: string): TabEntry {
  const entry = modelTabEntries(store, store.getState(), urn)[0];
  if (!entry || entry.kind === 'separator') throw new Error('no tab entry');
  return entry;
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

  it('has no entries for a urn that is not open', () => {
    const store = createOpenModelsStore(null);
    store.open('u1');
    expect(modelTabEntries(store, store.getState(), 'zzz')).toEqual([]);
  });
});
