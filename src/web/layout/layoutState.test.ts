import { describe, expect, it } from 'vitest';
import {
  adoptArrangement,
  defaultModel,
  layoutReducer,
  loadWithFallback,
  PREVIOUS_VIEWER,
  parseLayout,
  type SerializedDock,
  type SerializedNode,
  sanitizeDock,
  serializeLayout,
  siblingCountOf,
  splitAxisOf,
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

function sampleDock(viewer = 'viewer:m1'): SerializedDock {
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
            data: [leaf('2', [viewer], 600), leaf('3', ['dashboard'], 220)],
          },
          leaf('4', ['summary'], 320),
        ],
      },
      width: 1440,
      height: 844,
      orientation: 'HORIZONTAL',
    },
    panels: panels(['tree', viewer, 'dashboard', 'summary']),
    activeGroup: '2',
  };
}

describe('layoutReducer', () => {
  it('stores the dock and toggles collapse without duplicates', () => {
    const start = defaultModel();
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
    expect(again.collapsed).toEqual(['dashboard', 'summary']);
    const expanded = layoutReducer(again, {
      type: 'setCollapsed',
      id: 'summary',
      collapsed: false,
    });
    expect(expanded.collapsed).toEqual(['dashboard']);
  });

  it('resets to the default model and forgets closed panes', () => {
    const custom = {
      dock: sampleDock(),
      collapsed: ['summary' as const],
      treeWidth: 400,
      dismissed: ['dashboard' as const],
      lastViewerArrangement: sampleDock(),
    };
    expect(layoutReducer(custom, { type: 'reset' })).toEqual(defaultModel());
  });

  it('starts with the dashboard collapsed and the optional panes closed', () => {
    expect(defaultModel().collapsed).toEqual(['dashboard']);
    expect(defaultModel().dock).toBeNull();
    expect(defaultModel().dismissed).toEqual(['measurements', 'views']);
  });

  it('keeps the Documents width the user resized to, within limits', () => {
    const start = defaultModel();
    const wider = layoutReducer(start, { type: 'treeWidth', width: 401.6 });
    expect(wider.treeWidth).toBe(402);
    expect(layoutReducer(wider, { type: 'treeWidth', width: 402 })).toBe(wider);
    expect(
      layoutReducer(wider, { type: 'treeWidth', width: 9000 }).treeWidth,
    ).toBe(480);
    expect(parseLayout(serializeLayout(wider))?.treeWidth).toBe(402);
  });

  it('remembers panes the user closed without duplicates', () => {
    const start = defaultModel();
    const once = layoutReducer(start, {
      type: 'dismiss',
      id: 'summary',
      dismissed: true,
    });
    const twice = layoutReducer(once, {
      type: 'dismiss',
      id: 'summary',
      dismissed: true,
    });
    expect(twice.dismissed).toEqual(['measurements', 'views', 'summary']);
    expect(twice).toBe(once);
    expect(
      layoutReducer(twice, { type: 'dismiss', id: 'summary', dismissed: false })
        .dismissed,
    ).toEqual(['measurements', 'views']);
  });
});

describe('serialize and parse', () => {
  it('drops the removed version history pane from a stored layout', () => {
    const stored = JSON.stringify({
      version: JSON.parse(serializeLayout(defaultModel())).version,
      layout: {
        dock: {
          ...sampleDock(),
          grid: {
            ...sampleDock().grid,
            root: {
              type: 'branch',
              size: 900,
              data: [
                {
                  type: 'leaf',
                  data: {
                    id: '1',
                    views: ['tree', 'versions'],
                    activeView: 'versions',
                  },
                  size: 320,
                },
                leaf('2', ['viewer:m1'], 600),
                leaf('5', ['versions'], 200),
              ],
            },
          },
          panels: panels(['tree', 'viewer:m1', 'versions']),
        },
        collapsed: ['versions'],
        dismissed: ['views', 'versions'],
        treeWidth: 320,
      },
    });
    const model = parseLayout(stored);
    expect(model).not.toBeNull();
    const dock = model?.dock;
    expect(dock && Object.keys(dock.panels).sort()).toEqual([
      'tree',
      'viewer:m1',
    ]);
    expect(JSON.stringify(dock?.grid)).not.toContain('versions');
    expect(model?.collapsed).toEqual([]);
    expect(model?.dismissed).toEqual(['views']);
  });

  it('round trips a layout with a version field', () => {
    const model = {
      dock: sampleDock(),
      collapsed: ['dashboard' as const],
      treeWidth: 360,
      dismissed: ['summary' as const, 'models' as const],
      lastViewerArrangement: sampleDock(),
    };
    const raw = serializeLayout(model);
    expect(JSON.parse(raw)).toMatchObject({ version: 2 });
    expect(parseLayout(raw)).toEqual(model);
  });

  it('keeps a saved dismissal of Models and leaves other saved layouts open to it', () => {
    const base = { dock: sampleDock(), collapsed: [], treeWidth: 320 };
    const closed = JSON.stringify({
      version: 2,
      layout: { ...base, dismissed: ['models'] },
    });
    expect(parseLayout(closed)?.dismissed).toEqual(['models']);
    const older = JSON.stringify({ version: 2, layout: base });
    expect(parseLayout(older)?.dismissed).toEqual([]);
  });

  it('rejects corrupt json, other versions and wrong shapes', () => {
    expect(parseLayout('{nope')).toBeNull();
    expect(parseLayout(null)).toBeNull();
    expect(parseLayout(JSON.stringify({ version: 0, layout: {} }))).toBeNull();
    expect(parseLayout(JSON.stringify({ version: 1, layout: {} }))).toBeNull();
    expect(parseLayout(JSON.stringify({ version: 3, layout: {} }))).toBeNull();
    expect(parseLayout(JSON.stringify([1, 2]))).toBeNull();
  });

  it.each([
    [
      'drops unknown collapsed ids and clamps the tree width',
      { dock: null, collapsed: ['summary', 'terminal'], treeWidth: 9 },
      { dock: null, collapsed: ['summary'], treeWidth: 260 },
    ],
    [
      'falls back to the default dock when the stored dock is unusable',
      { dock: { grid: 'x' }, collapsed: [], treeWidth: 320 },
      { dock: null, collapsed: [], treeWidth: 320 },
    ],
  ])('%s', (_name, layout, expected) => {
    const raw = JSON.stringify({ version: 2, layout });
    expect(parseLayout(raw)).toEqual({
      ...expected,
      dismissed: [],
      lastViewerArrangement: null,
    });
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
    const sizes = (
      (result?.dock.grid.root.data ?? []) as { size: number }[]
    ).map((node) => node.size);
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBeCloseTo(1540);
    expect(sizes[0]).toBeCloseTo((320 * 1540) / 1440);
    expect(JSON.stringify(result?.dock)).not.toContain('terminal');
  });

  it('gives the space of a dropped pane to its siblings', () => {
    const dock = sampleDock();
    delete dock.panels.dashboard;
    const result = sanitizeDock(dock);
    const middle = ((result?.dock.grid.root.data ?? []) as SerializedNode[])[1];
    expect(middle).toMatchObject({ type: 'leaf', size: 800 });
    expect(JSON.stringify(middle?.data)).toContain('"views":["viewer:m1"]');
  });

  it('splices a branch left with one branch into its grandparent', () => {
    const dock = sampleDock();
    dock.grid.root.data = [
      leaf('1', ['tree'], 300),
      {
        type: 'branch',
        size: 900,
        data: [
          {
            type: 'branch',
            size: 600,
            data: [leaf('2', ['viewer:m1'], 200), leaf('4', ['summary'], 400)],
          },
          leaf('3', ['ghost'], 300),
        ],
      },
    ];
    const result = sanitizeDock(dock);
    const root = (result?.dock.grid.root.data ?? []) as SerializedNode[];
    expect(root.map((node) => (node.data as { id?: string }).id)).toEqual([
      '1',
      '2',
      '4',
    ]);
    expect(root.map((node) => node.size)).toEqual([300, 300, 600]);
    expect(result?.dock.grid.orientation).toBe('HORIZONTAL');
  });

  it('flips the root orientation when only one branch is left under it', () => {
    const dock = sampleDock();
    dock.grid.root.data = [
      leaf('9', ['ghost'], 400),
      {
        type: 'branch',
        size: 1040,
        data: [leaf('2', ['viewer:m1'], 600), leaf('3', ['dashboard'], 240)],
      },
    ];
    const result = sanitizeDock(dock);
    expect(result?.dock.grid.orientation).toBe('VERTICAL');
    expect(
      ((result?.dock.grid.root.data ?? []) as SerializedNode[]).map(
        (node) => (node.data as { id: string }).id,
      ),
    ).toEqual(['2', '3']);
  });

  it('removes an unknown tab from a shared group and fixes the active tab', () => {
    const dock = sampleDock();
    dock.grid.root.data = [
      {
        type: 'leaf',
        size: 900,
        data: {
          id: '1',
          views: ['terminal', 'viewer:m1'],
          activeView: 'terminal',
        },
      },
    ];
    dock.panels = panels(['terminal', 'viewer:m1']);
    const result = sanitizeDock(dock);
    const only = (
      (result?.dock.grid.root.data ?? []) as { data: unknown }[]
    )[0];
    expect(only?.data).toEqual({
      id: '1',
      views: ['viewer:m1'],
      activeView: 'viewer:m1',
    });
    expect(Object.keys(result?.dock.panels ?? {})).toEqual(['viewer:m1']);
  });

  it('reports Documents as missing and nothing else', () => {
    const dock = sampleDock();
    dock.grid.root.data = [leaf('1', ['summary'], 900)];
    dock.panels = panels(['summary']);
    expect(sanitizeDock(dock)?.missing).toEqual(['tree']);
    dock.grid.root.data = [leaf('1', ['tree'], 900)];
    dock.panels = panels(['tree']);
    expect(sanitizeDock(dock)?.missing).toEqual([]);
  });

  it('drops the empty viewer of older layouts', () => {
    const result = sanitizeDock(sampleDock('viewer'));
    expect(viewsOf(result?.dock, '2')).toEqual([]);
    expect(Object.keys(result?.dock.panels ?? {})).not.toContain('viewer');
    expect(result?.missing).toEqual([]);
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
  it.each([
    [
      'HORIZONTAL',
      { '1': 'width', '4': 'width', '2': 'height', '3': 'height', '42': null },
    ],
    ['VERTICAL', { '1': 'height', '2': 'width' }],
  ] as const)(
    'alternates the split axis with depth from the %s root',
    (orientation, axes) => {
      const dock = sampleDock();
      dock.grid.orientation = orientation;
      for (const [group, axis] of Object.entries(axes)) {
        expect(splitAxisOf(dock, group)).toBe(axis);
      }
    },
  );
});

describe('siblingCountOf', () => {
  it('counts the views in the split that holds the group', () => {
    const dock = sampleDock();
    expect(siblingCountOf(dock, '1')).toBe(3);
    expect(siblingCountOf(dock, '2')).toBe(2);
    expect(siblingCountOf(dock, '42')).toBeNull();
  });
});

function modelDock(views: string[]): SerializedDock {
  const dock = sampleDock();
  const root = dock.grid.root.data as ReturnType<typeof leaf>[];
  const middle = root[1] as unknown as { data: ReturnType<typeof leaf>[] };
  middle.data[0] = leaf('2', views, 600);
  return {
    ...dock,
    panels: panels(['tree', ...views, 'dashboard', 'summary']),
  };
}

function viewsOf(dock: SerializedDock | undefined, group: string): string[] {
  const found: string[][] = [];
  const visit = (node: { type: string; data: unknown }) => {
    if (node.type === 'leaf') {
      const data = node.data as { id: string; views: string[] };
      if (data.id === group) found.push(data.views);
    } else {
      for (const child of node.data as { type: string; data: unknown }[]) {
        visit(child);
      }
    }
  };
  if (dock) visit(dock.grid.root);
  return found[0] ?? [];
}

describe('model tabs in the dock', () => {
  it.each([
    [
      'keeps model tabs that are open and drops the others',
      ['viewer:a', 'viewer:b', 'viewer:c'],
      ['viewer:a', 'viewer:c'],
    ],
    [
      'drops every model tab when no model is open and asks for nothing',
      ['viewer:a', 'viewer:b'],
      [],
    ],
  ])('%s', (_name, tabs, open) => {
    const result = sanitizeDock(modelDock(tabs), open);
    expect(viewsOf(result?.dock, '2')).toEqual(open);
    expect(Object.keys(result?.dock.panels ?? {}).sort()).toEqual(
      ['dashboard', 'summary', 'tree', ...open].sort(),
    );
    expect(result?.missing).toEqual([]);
  });

  it('parses model tabs without knowing which models are open', () => {
    const model = {
      dock: modelDock(['viewer:a']),
      collapsed: [],
      treeWidth: 320,
      dismissed: [],
      lastViewerArrangement: null,
    };
    expect(
      parseLayout(serializeLayout(model))?.dock?.panels['viewer:a'],
    ).toBeDefined();
  });
});

describe('remembered viewer arrangement', () => {
  it('remembers the last dock that had a model and keeps it when models close', () => {
    const withModel = layoutReducer(defaultModel(), {
      type: 'dock',
      dock: sampleDock(),
    });
    expect(withModel.lastViewerArrangement).toBeNull();
    const moved = layoutReducer(withModel, {
      type: 'dock',
      dock: sampleDock(),
    });
    expect(moved.lastViewerArrangement).toBeNull();
    expect(serializeLayout(moved).length).toBeLessThan(
      JSON.stringify(sampleDock()).length * 1.5,
    );
    const alone = sanitizeDock(sampleDock(), [])?.dock as SerializedDock;
    const closed = layoutReducer(withModel, { type: 'dock', dock: alone });
    expect(closed.dock).toEqual(alone);
    expect(closed.lastViewerArrangement).toEqual(sampleDock());
    expect(parseLayout(serializeLayout(closed))?.lastViewerArrangement).toEqual(
      sampleDock(),
    );
    expect(
      layoutReducer(closed, { type: 'reset' }).lastViewerArrangement,
    ).toBeNull();
  });

  it('puts new models where the viewer was and keeps the companions placed', () => {
    const adopted = adoptArrangement(
      sampleDock(),
      ['viewer:x', 'viewer:y'],
      'viewer:y',
      ['summary', 'dashboard'],
      { 'viewer:x': { label: 'X.rvt' } },
    );
    expect(viewsOf(adopted ?? undefined, '2')).toEqual([
      'viewer:x',
      'viewer:y',
    ]);
    expect(viewsOf(adopted ?? undefined, '3')).toEqual(['dashboard']);
    expect(viewsOf(adopted ?? undefined, '4')).toEqual(['summary']);
    expect(adopted?.panels['viewer:x']).toMatchObject({
      id: 'viewer:x',
      title: 'X.rvt',
    });
    expect(adopted?.panels['viewer:m1']).toBeUndefined();
    expect(JSON.stringify(adopted?.grid.root)).toContain(
      '"id":"2","views":["viewer:x","viewer:y"],"activeView":"viewer:y"',
    );
  });

  it('leaves out companions the user closed', () => {
    const adopted = adoptArrangement(sampleDock(), ['viewer:x'], null, [
      'dashboard',
    ]);
    expect(Object.keys(adopted?.panels ?? {}).sort()).toEqual([
      'dashboard',
      'tree',
      'viewer:x',
    ]);
  });

  it('returns nothing without models or without a viewer slot', () => {
    expect(adoptArrangement(sampleDock(), [], null, [])).toBeNull();
    const alone = sanitizeDock(sampleDock(), [])?.dock as SerializedDock;
    expect(adoptArrangement(alone, ['viewer:x'], null, [])).toBeNull();
  });

  it('keeps the arrangement of older records that had the empty viewer', () => {
    const raw = JSON.stringify({
      version: 2,
      layout: {
        dock: sampleDock('viewer'),
        collapsed: [],
        treeWidth: 320,
      },
    });
    const model = parseLayout(raw);
    expect(Object.keys(model?.dock?.panels ?? {})).not.toContain('viewer');
    expect(viewsOf(model?.lastViewerArrangement ?? undefined, '2')).toEqual([
      PREVIOUS_VIEWER,
    ]);
  });
});

describe('loading a saved dock', () => {
  it('drops only the panel the dock library rejects', () => {
    const tried: string[][] = [];
    const loaded = loadWithFallback(sampleDock(), (dock) => {
      const ids = Object.keys(dock.panels);
      tried.push(ids);
      if (ids.includes('dashboard')) throw new Error('bad dashboard');
    });
    expect(Object.keys(loaded?.panels ?? {}).sort()).toEqual([
      'summary',
      'tree',
      'viewer:m1',
    ]);
    expect(tried[0]).toContain('dashboard');
  });

  it('never drops a required panel and gives up when nothing loads', () => {
    const tried: string[][] = [];
    const loaded = loadWithFallback(
      sampleDock(),
      (dock) => {
        tried.push(Object.keys(dock.panels));
        throw new Error('broken');
      },
      (id) => id === 'tree',
    );
    expect(loaded).toBeNull();
    expect(tried.every((ids) => ids.includes('tree'))).toBe(true);
  });
});
