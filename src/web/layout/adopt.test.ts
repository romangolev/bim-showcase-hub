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

function fakeApi() {
  const panels: { id: string }[] = [];
  const api = {
    get panels() {
      return panels;
    },
    getPanel: (id: string) => panels.find((panel) => panel.id === id),
    clear: () => {
      panels.length = 0;
    },
    fromJSON: () => {
      panels.length = 0;
      throw new Error('bad layout');
    },
    addPanel: (options: { id: string }) => {
      const panel = {
        id: options.id,
        group: { api: { setSize: () => {} }, panels: [], activePanel: null },
        api: {
          setActive: () => {},
          close: () => {},
          location: { type: 'grid' },
        },
      };
      panels.push(panel);
      return panel;
    },
  };
  return { api: api as unknown as DockviewApi, panels };
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
});
