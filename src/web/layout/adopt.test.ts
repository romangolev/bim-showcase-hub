import type { DockviewApi } from 'dockview';
import { describe, expect, it } from 'vitest';
import { syncInstances } from './dockOps.js';
import type { SerializedDock } from './layoutState.js';

function leaf(id: string, views: string[], size = 100) {
  return {
    type: 'leaf' as const,
    data: { id, views, activeView: views[0] },
    size,
  };
}

const ARRANGEMENT: SerializedDock = {
  grid: {
    root: {
      type: 'branch',
      size: 900,
      data: [
        leaf('1', ['tree'], 320),
        leaf('2', ['viewer:m1'], 600),
        leaf('4', ['summary'], 320),
      ],
    },
    width: 1440,
    height: 844,
    orientation: 'HORIZONTAL',
  },
  panels: Object.fromEntries(
    ['tree', 'viewer:m1', 'summary'].map((id) => [
      id,
      { id, contentComponent: 'pane', title: id },
    ]),
  ),
  activeGroup: '2',
};

function fakeApi(existing: string[] = []) {
  const panels: { id: string }[] = [];
  let loads = 0;
  const make = (id: string) => ({
    id,
    group: { api: { setSize: () => {} }, panels: [], activePanel: null },
    api: {
      setActive: () => {},
      close: () => {},
      location: { type: 'grid' },
    },
  });
  panels.push(...existing.map(make));
  const api = {
    get panels() {
      return panels;
    },
    getPanel: (id: string) => panels.find((panel) => panel.id === id),
    clear: () => {
      panels.length = 0;
    },
    fromJSON: () => {
      loads += 1;
      panels.length = 0;
      throw new Error('bad layout');
    },
    addPanel: (options: { id: string }) => {
      const panel = make(options.id);
      panels.push(panel);
      return panel;
    },
  };
  return {
    api: api as unknown as DockviewApi,
    panels,
    loads: () => loads,
  };
}

describe('adopting a remembered arrangement', () => {
  it('rebuilds the default layout when the snapshot cannot be loaded', () => {
    const { api, panels } = fakeApi();
    syncInstances(api, {
      instances: ['viewer:x'],
      active: 'viewer:x',
      titles: {},
      companions: ['summary'],
      treeWidth: 320,
      arrangement: ARRANGEMENT,
    });
    const ids = panels.map((panel) => panel.id);
    expect(ids).toContain('tree');
    expect(ids).toContain('viewer:x');
  });

  it('keeps user panes placed at home instead of rebuilding from the snapshot', () => {
    const { api, panels, loads } = fakeApi(['tree', 'chart:1']);
    syncInstances(api, {
      instances: ['viewer:x', 'chart:1'],
      active: 'viewer:x',
      titles: {},
      companions: ['summary'],
      treeWidth: 320,
      arrangement: ARRANGEMENT,
    });
    expect(loads()).toBe(0);
    expect(panels.map((panel) => panel.id)).toEqual([
      'tree',
      'chart:1',
      'viewer:x',
      'summary',
    ]);
  });

  it('still adopts the snapshot when only the tree is docked', () => {
    const { api, loads } = fakeApi(['tree']);
    syncInstances(api, {
      instances: ['viewer:x'],
      active: 'viewer:x',
      titles: {},
      companions: ['summary'],
      treeWidth: 320,
      arrangement: ARRANGEMENT,
    });
    expect(loads()).toBe(1);
  });
});
