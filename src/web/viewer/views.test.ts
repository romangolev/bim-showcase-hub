import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setStorageAdapter } from '../storage.js';
import { memoryAdapter } from '../storageAdapter.js';
import { createMockViewerAdapter } from './MockViewerAdapter.js';
import type { ModelInfo } from './modelSet.js';
import type { ViewerAdapter, ViewNode } from './ViewerAdapter.js';
import {
  MAX_VIEW_PREF_URNS,
  MODEL_VIEWS_KEY,
  orderViews,
  switchView,
  VIEW_PREFS,
  type ViewPrefsMap,
  viewPrefsFor,
  withFavorite,
  withHidden,
  withStartView,
} from './views.js';

const VIEW3D: ViewNode = {
  id: 'mock-3d',
  name: '{3D}',
  role: '3d',
  current: true,
};
const SHEET: ViewNode = {
  id: 'mock-a101',
  name: 'A101 - Plans',
  role: '2d',
  current: false,
};

const hosts: HTMLElement[] = [];
const adapters: ViewerAdapter[] = [];

async function loaded(sources: string[]): Promise<ViewerAdapter> {
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  const adapter = await createMockViewerAdapter(host);
  adapters.push(adapter);
  await adapter.loadModels(sources.map((urn) => ({ urn })));
  return adapter;
}

beforeEach(() => {
  setStorageAdapter(memoryAdapter());
});

afterEach(() => {
  for (const adapter of adapters.splice(0)) adapter.destroy();
  for (const host of hosts.splice(0)) host.remove();
});

describe('orderViews', () => {
  it('puts favorites first and takes them out of their dimension group', () => {
    expect(orderViews([VIEW3D, SHEET], viewPrefsFor('u1'))).toEqual({
      favorites: [],
      views3d: [VIEW3D],
      sheets: [SHEET],
      hidden: [],
    });
    const prefs = {
      ...viewPrefsFor('u1'),
      favorites: [SHEET.id],
    };
    expect(orderViews([VIEW3D, SHEET], prefs)).toEqual({
      favorites: [SHEET],
      views3d: [VIEW3D],
      sheets: [],
      hidden: [],
    });
  });

  it('moves hidden views behind the count and ignores unknown pref ids', () => {
    const prefs = {
      favorites: ['gone', VIEW3D.id],
      hidden: [VIEW3D.id, 'gone'],
    };
    expect(orderViews([VIEW3D, SHEET], prefs)).toEqual({
      favorites: [],
      views3d: [],
      sheets: [SHEET],
      hidden: [VIEW3D],
    });
  });
});

describe('view preferences', () => {
  it('starts empty and keeps only what is set', () => {
    expect(viewPrefsFor('u1')).toEqual({ favorites: [], hidden: [] });
    VIEW_PREFS.write(
      withStartView(withFavorite({}, 'u1', SHEET.id, true), 'u1', SHEET.id),
    );
    expect(viewPrefsFor('u1')).toEqual({
      start: SHEET.id,
      favorites: [SHEET.id],
      hidden: [],
    });
    expect(viewPrefsFor('u2')).toEqual({ favorites: [], hidden: [] });
  });

  it('toggles favorites and hidden ids and drops an empty document', () => {
    const favorite = withFavorite({}, 'u1', SHEET.id, true);
    expect(viewPrefsFor('u1', favorite).favorites).toEqual([SHEET.id]);
    const unfavorite = withFavorite(favorite, 'u1', SHEET.id, false);
    expect(unfavorite).toEqual({});
    const hidden = withHidden({}, 'u1', VIEW3D.id, true);
    expect(viewPrefsFor('u1', hidden).hidden).toEqual([VIEW3D.id]);
    expect(withHidden(hidden, 'u1', VIEW3D.id, false)).toEqual({});
  });

  it('clears the start view and keeps the other preferences', () => {
    const prefs = withStartView({}, 'u1', SHEET.id);
    const kept = withFavorite(prefs, 'u1', VIEW3D.id, true);
    expect(withStartView(kept, 'u1', null)).toEqual({
      u1: { favorites: [VIEW3D.id], hidden: [] },
    });
  });

  it(`keeps at most ${MAX_VIEW_PREF_URNS} documents and drops the oldest`, () => {
    let prefs: ViewPrefsMap = {};
    for (let index = 0; index < MAX_VIEW_PREF_URNS + 5; index += 1) {
      prefs = withStartView(prefs, `u${index}`, VIEW3D.id);
    }
    const urns = Object.keys(prefs);
    expect(urns).toHaveLength(MAX_VIEW_PREF_URNS);
    expect(urns[0]).toBe('u5');
    expect(urns.at(-1)).toBe(`u${MAX_VIEW_PREF_URNS + 4}`);
    const touched = withStartView(prefs, 'u5', SHEET.id);
    expect(Object.keys(touched)[0]).toBe('u6');
    expect(Object.keys(touched).at(-1)).toBe('u5');
  });

  it('sanitizes stored preferences and ignores a corrupt document', () => {
    const adapter = memoryAdapter();
    setStorageAdapter(adapter);
    adapter.set(
      'local',
      MODEL_VIEWS_KEY,
      JSON.stringify({
        u1: { start: 4, favorites: ['a', 'a', 7], hidden: 'x' },
        u2: { start: 'g1', favorites: ['a'], hidden: ['b'] },
        u3: {},
      }),
    );
    expect(VIEW_PREFS.read()).toEqual({
      u1: { favorites: ['a'], hidden: [] },
      u2: { start: 'g1', favorites: ['a'], hidden: ['b'] },
    });
  });
});

describe('switchView', () => {
  it('reloads a single-model tab with the chosen view', async () => {
    const adapter = await loaded(['dXJuOmFkc2s']);
    expect(await switchView(adapter, 'dXJuOmFkc2s', SHEET)).toBe('ok');
    expect(adapter.getModels()[0]?.view).toBe(SHEET.id);
    const current = (await adapter.listViews('dXJuOmFkc2s')).find(
      (view) => view.current,
    );
    expect(current?.id).toBe(SHEET.id);
  });

  it('refuses a view of another dimension in a combined tab', async () => {
    const adapter = await loaded(['aaa', 'bbb']);
    expect(await switchView(adapter, 'bbb', SHEET)).toBe('dimension');
    expect(adapter.getModels()).toHaveLength(2);
    expect(adapter.getModels()[1]?.view).toBeUndefined();
  });

  it('swaps a model for the same dimension in a combined tab', async () => {
    const adapter = await loaded(['aaa', 'bbb']);
    expect(await switchView(adapter, 'bbb', VIEW3D)).toBe('ok');
    expect(adapter.getModels()).toHaveLength(2);
    expect(adapter.getModels()[1]?.view).toBe(VIEW3D.id);
  });

  it('reports an unknown model and a failed reload', async () => {
    const adapter = await loaded(['dXJuOmFkc2s']);
    expect(await switchView(adapter, 'nope', VIEW3D)).toBe('failed');
    const model: ModelInfo = {
      id: 'u1',
      urn: 'u1',
      name: 'Model 1',
      visible: true,
      status: 'ready',
    };
    const broken = {
      getModels: () => [model],
      loadModels: async () => {
        throw new Error('no');
      },
    } as unknown as ViewerAdapter;
    expect(await switchView(broken, 'u1', SHEET)).toBe('failed');
  });
});
