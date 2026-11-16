import { describe, expect, it } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import {
  defaultModel,
  importLegacy,
  LAYOUT_KEY,
  LEGACY_KEYS,
  layoutReducer,
  parseLayout,
  readLayout,
  type SerializedDock,
  sanitizeDock,
  serializeLayout,
  siblingCountOf,
  splitAxisOf,
  writeLayout,
} from './layoutState.js';

function leaf(id: string, views: string[], size = 100) {
  return {
    type: 'leaf' as const,
    data: { id, views, activeView: views[0] },
    size,
  };
}

function panels(ids: string[]) {
  return Object.fromEntries(
    ids.map((id) => [id, { id, contentComponent: 'pane', title: id }]),
  );
}

function sampleDock(): SerializedDock {
  return {
    grid: {
      root: {
        type: 'branch',
        size: 900,
        data: [
          leaf('1', ['tree'], 320),
          {
            type: 'branch',
            size: 800,
            data: [leaf('2', ['viewer'], 600), leaf('3', ['dashboard'], 220)],
          },
          leaf('4', ['summary'], 320),
        ],
      },
      width: 1440,
      height: 844,
      orientation: 'HORIZONTAL',
    },
    panels: panels(['tree', 'viewer', 'dashboard', 'summary']),
    activeGroup: '2',
  };
}

describe('layoutReducer', () => {
  it('stores the dock and toggles collapse without duplicates', () => {
    const start = defaultModel(1000);
    const docked = layoutReducer(start, { type: 'dock', dock: sampleDock() });
    expect(docked.dock).toEqual(sampleDock());
    const collapsed = layoutReducer(docked, {
      type: 'setCollapsed',
      id: 'summary',
      collapsed: true,
    });
    const again = layoutReducer(collapsed, {
      type: 'setCollapsed',
      id: 'summary',
      collapsed: true,
    });
    expect(again.collapsed).toEqual(['summary']);
    const expanded = layoutReducer(again, {
      type: 'setCollapsed',
      id: 'summary',
      collapsed: false,
    });
    expect(expanded.collapsed).toEqual([]);
  });

  it('resets to the default model for the window height', () => {
    const custom = {
      dock: sampleDock(),
      collapsed: ['summary' as const],
      treeWidth: 400,
    };
    expect(layoutReducer(custom, { type: 'reset', height: 800 })).toEqual(
      defaultModel(800),
    );
  });

  it('collapses the dashboard by default only on short windows', () => {
    expect(defaultModel(1000).collapsed).toEqual([]);
    expect(defaultModel(800).collapsed).toEqual(['dashboard']);
    expect(defaultModel(800).dock).toBeNull();
  });
});

describe('serialize and parse', () => {
  it('round trips a layout with a version field', () => {
    const model = {
      dock: sampleDock(),
      collapsed: ['dashboard' as const],
      treeWidth: 360,
    };
    const raw = serializeLayout(model);
    expect(JSON.parse(raw)).toMatchObject({ version: 1 });
    expect(parseLayout(raw)).toEqual(model);
  });

  it('rejects corrupt json, other versions and wrong shapes', () => {
    expect(parseLayout('{nope')).toBeNull();
    expect(parseLayout(null)).toBeNull();
    expect(parseLayout(JSON.stringify({ version: 0, layout: {} }))).toBeNull();
    expect(parseLayout(JSON.stringify({ version: 2, layout: {} }))).toBeNull();
    expect(parseLayout(JSON.stringify([1, 2]))).toBeNull();
  });

  it('drops unknown collapsed ids and clamps the tree width', () => {
    const raw = JSON.stringify({
      version: 1,
      layout: { dock: null, collapsed: ['summary', 'terminal'], treeWidth: 9 },
    });
    expect(parseLayout(raw)).toEqual({
      dock: null,
      collapsed: ['summary'],
      treeWidth: 260,
    });
  });

  it('falls back to the default dock when the stored dock is unusable', () => {
    const raw = JSON.stringify({
      version: 1,
      layout: { dock: { grid: 'x' }, collapsed: [], treeWidth: 320 },
    });
    expect(parseLayout(raw)?.dock).toBeNull();
  });
});

describe('sanitizeDock', () => {
  it('keeps a valid dock and reports nothing missing', () => {
    const result = sanitizeDock(sampleDock());
    expect(result?.dock).toEqual(sampleDock());
    expect(result?.missing).toEqual([]);
  });

  it('drops unknown panes and prunes the groups and branches they leave empty', () => {
    const dock = sampleDock();
    const branch = dock.grid.root.data as SerializedDock['grid']['root'][];
    branch.push(leaf('9', ['terminal']));
    dock.panels.terminal = { id: 'terminal', contentComponent: 'pane' };
    const result = sanitizeDock(dock);
    expect(result?.dock).toEqual(sampleDock());
  });

  it('removes an unknown tab from a shared group and fixes the active tab', () => {
    const dock = sampleDock();
    dock.grid.root.data = [
      {
        type: 'leaf',
        size: 900,
        data: {
          id: '1',
          views: ['terminal', 'viewer'],
          activeView: 'terminal',
        },
      },
    ];
    dock.panels = panels(['terminal', 'viewer']);
    const result = sanitizeDock(dock);
    const only = (
      (result?.dock.grid.root.data ?? []) as { data: unknown }[]
    )[0];
    expect(only?.data).toEqual({
      id: '1',
      views: ['viewer'],
      activeView: 'viewer',
    });
    expect(Object.keys(result?.dock.panels ?? {})).toEqual(['viewer']);
  });

  it('reports required panes that are missing', () => {
    const dock = sampleDock();
    dock.grid.root.data = [leaf('1', ['tree'], 900)];
    dock.panels = panels(['tree']);
    expect(sanitizeDock(dock)?.missing).toEqual(['viewer']);
  });

  it('cleans floating groups, drops popout groups and duplicate panes', () => {
    const dock = {
      ...sampleDock(),
      floatingGroups: [
        {
          data: {
            id: '7',
            views: ['summary', 'terminal'],
            activeView: 'terminal',
          },
          position: { top: 10, left: 10, width: 300, height: 200 },
        },
        {
          data: { id: '8', views: ['terminal'], activeView: 'terminal' },
          position: { top: 10, left: 10, width: 300, height: 200 },
        },
      ],
      popoutGroups: [{ data: { id: '9', views: ['tree'] } }],
    };
    const result = sanitizeDock(dock);
    expect(result?.dock.floatingGroups).toEqual([]);
    expect(result?.dock.popoutGroups).toBeUndefined();
  });

  it('returns null when nothing usable is left', () => {
    expect(sanitizeDock(null)).toBeNull();
    expect(sanitizeDock({ grid: { root: leaf('1', ['x']) } })).toBeNull();
    const dock = sampleDock();
    dock.grid.root.data = [leaf('1', ['terminal'])];
    expect(sanitizeDock(dock)).toBeNull();
  });

  it('drops an active group that no longer exists', () => {
    const dock = { ...sampleDock(), activeGroup: '42' };
    expect(sanitizeDock(dock)?.dock.activeGroup).toBeUndefined();
  });
});

describe('splitAxisOf', () => {
  it('alternates the split axis with depth', () => {
    const dock = sampleDock();
    expect(splitAxisOf(dock, '1')).toBe('width');
    expect(splitAxisOf(dock, '4')).toBe('width');
    expect(splitAxisOf(dock, '2')).toBe('height');
    expect(splitAxisOf(dock, '3')).toBe('height');
    expect(splitAxisOf(dock, '42')).toBeNull();
  });

  it('starts from the root orientation', () => {
    const dock = sampleDock();
    dock.grid.orientation = 'VERTICAL';
    expect(splitAxisOf(dock, '1')).toBe('height');
    expect(splitAxisOf(dock, '2')).toBe('width');
  });
});

describe('siblingCountOf', () => {
  it('counts the views in the split that holds the group', () => {
    const dock = sampleDock();
    expect(siblingCountOf(dock, '1')).toBe(3);
    expect(siblingCountOf(dock, '2')).toBe(2);
    expect(siblingCountOf(dock, '42')).toBeNull();
  });
});

describe('storage', () => {
  it('imports the old keys once, deletes them and saves the new record', () => {
    const storage = installMemoryStorage();
    storage.setItem(LEGACY_KEYS.treeWidth, '400');
    storage.setItem(LEGACY_KEYS.summary, '1');
    storage.setItem(LEGACY_KEYS.dashboard, '0');
    const model = readLayout(storage, 800);
    expect(model).toEqual({
      dock: null,
      collapsed: ['summary'],
      treeWidth: 400,
    });
    expect(storage.getItem(LEGACY_KEYS.treeWidth)).toBeNull();
    expect(storage.getItem(LEGACY_KEYS.summary)).toBeNull();
    expect(storage.getItem(LEGACY_KEYS.dashboard)).toBeNull();
    expect(parseLayout(storage.getItem(LAYOUT_KEY))).toEqual(model);
    storage.setItem(LEGACY_KEYS.summary, '0');
    expect(readLayout(storage, 800)).toEqual(model);
  });

  it('uses the window height when no dashboard choice was stored', () => {
    const storage = installMemoryStorage();
    expect(importLegacy(storage, 800).collapsed).toEqual(['dashboard']);
    expect(importLegacy(storage, 1000).collapsed).toEqual([]);
  });

  it('falls back to the default when the stored record is corrupt', () => {
    const storage = installMemoryStorage();
    storage.setItem(LAYOUT_KEY, '{broken');
    storage.setItem(LEGACY_KEYS.summary, '1');
    expect(readLayout(storage, 1000)).toEqual(defaultModel(1000));
  });

  it('survives storage that throws', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    const storage = {
      ...installMemoryStorage(),
      getItem: blocked,
      setItem: blocked,
      removeItem: blocked,
    };
    expect(readLayout(storage, 1000)).toEqual(defaultModel(1000));
    expect(() => writeLayout(storage, defaultModel(1000))).not.toThrow();
  });

  it('writes the record under the versioned key', () => {
    const storage = installMemoryStorage();
    writeLayout(storage, defaultModel(1000));
    expect(JSON.parse(storage.getItem(LAYOUT_KEY) ?? '')).toEqual({
      version: 1,
      layout: { dock: null, collapsed: [], treeWidth: 320 },
    });
  });
});
