import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_COMBINED_MODELS,
  MAX_LOADED_MEMBERS,
} from '../../../shared/combined.js';
import type { TreeNode, VersionViewState } from '../../../shared/types.js';
import { MODEL_LIMIT_MESSAGE } from '../../viewer/modelSet.js';
import { DEFAULT_TREE_ROOT } from './docRoot.js';
import {
  CHECK_CONCURRENCY,
  createTreeState,
  overTabLimit,
  pickLimit,
  skippedNotice,
  type TreeData,
  type TreeHost,
  tabLimitMessage,
} from './treeState.js';

function node(id: string, extra: Partial<TreeNode> = {}): TreeNode {
  return {
    id,
    kind: 'folder',
    name: id,
    hasChildren: true,
    viewable: false,
    ...extra,
  };
}

function version(id: string, parentId: string, extra: Partial<TreeNode> = {}) {
  return node(id, {
    kind: 'version',
    hasChildren: false,
    parentId,
    urn: `urn:${id}`,
    viewState: 'ready',
    ...extra,
  });
}

const TREE: Record<string, TreeNode[]> = {
  root: [node('h', { kind: 'hub', parentId: 'root' })],
  h: [node('p', { kind: 'project', parentId: 'h' })],
  p: [node('f', { parentId: 'p' }), node('a', { parentId: 'p' })],
  f: [
    node('doc.rvt', { kind: 'item', parentId: 'f' }),
    node('empty', { parentId: 'f', hasChildren: false }),
  ],
  'doc.rvt': [
    version('v1', 'doc.rvt', { name: 'v1: first' }),
    version('v2', 'doc.rvt', { name: 'v2: second', viewState: 'processing' }),
  ],
};

function fakeData(overrides: Partial<TreeData> = {}) {
  const calls = { children: [] as string[], forget: [] as string[] };
  const data: TreeData = {
    children: async (scope) => {
      const id = scope.kind === 'root' ? 'root' : scope.id;
      calls.children.push(id);
      return TREE[id] ?? [];
    },
    forget: (scope) => {
      calls.forget.push(scope.kind === 'root' ? 'root' : scope.id);
    },
    viewState: async () => ({ viewState: 'ready', viewable: true }),
    ...overrides,
  };
  return { data, calls };
}

function fakeHost(expanded: string[] = []) {
  const open = new Set(expanded);
  const invalidated: [string, boolean | undefined][] = [];
  const host: TreeHost = {
    folders: () =>
      Object.keys(TREE).map((id) => ({ id, expanded: open.has(id) })),
    isExpanded: (id) => open.has(id),
    expand: (id) => {
      open.add(id);
    },
    invalidate: (id, keep) => {
      invalidated.push([id, keep]);
    },
  };
  return { host, invalidated, open };
}

function make(overrides: Partial<TreeData> = {}) {
  const { data, calls } = fakeData(overrides);
  const state = createTreeState({
    root: DEFAULT_TREE_ROOT,
    data,
    sort: () => 'name',
  });
  const fake = fakeHost();
  state.bind(fake.host);
  return { state, calls, ...fake };
}

async function loadAll(state: ReturnType<typeof make>['state']) {
  for (const id of ['root', 'h', 'p', 'f', 'doc.rvt']) {
    await state.children(id);
  }
}

describe('treeState loading', () => {
  it('loads children of a known node, registers them and marks it loaded', async () => {
    const { state, calls } = make();
    expect(state.isLoaded('root')).toBe(false);
    const children = await state.children('root');
    expect(children.map((child) => child.id)).toEqual(['h']);
    expect(state.node('h')?.kind).toBe('hub');
    expect(state.isLoaded('root')).toBe(true);
    expect(calls.children).toEqual(['root']);
  });

  it('returns nothing for an unknown node without calling the data seam', async () => {
    const { state, calls } = make();
    expect(await state.children('nope')).toEqual([]);
    expect(calls.children).toEqual([]);
  });

  it('sorts children with the current sort', async () => {
    const { state } = make();
    await state.children('root');
    await state.children('h');
    await state.children('p');
    expect(state.search('').map((entry) => entry.id)).toEqual([
      'h',
      'p',
      'a',
      'f',
    ]);
  });

  it('records a load error, notifies, and clears it on a later success', async () => {
    let fail = true;
    const { state } = make({
      children: async () => {
        if (fail) throw new Error('boom');
        return TREE.root ?? [];
      },
    });
    const listener = vi.fn();
    state.subscribe(listener);
    expect(await state.children('root')).toEqual([]);
    expect(state.getSnapshot().errors.root?.detail).toBe('boom');
    expect(state.isLoaded('root')).toBe(false);
    expect(listener).toHaveBeenCalled();
    fail = false;
    await state.children('root');
    expect(state.getSnapshot().errors.root).toBeUndefined();
    expect(state.isLoaded('root')).toBe(true);
  });
});

describe('treeState navigation', () => {
  it('walks ancestors, parent name and context', async () => {
    const { state } = make();
    await loadAll(state);
    const v1 = state.node('v1');
    if (!v1) throw new Error('v1 missing');
    expect(state.ancestorIds(v1)).toEqual(['root', 'h', 'p', 'f', 'doc.rvt']);
    expect(state.parentName(v1)).toBe('doc.rvt');
    expect(state.contextFor(v1)).toEqual({
      trail: ['root', 'h', 'p', 'f', 'doc.rvt'].filter((id) => state.node(id)),
      crumbs: ['Hubs', 'h', 'p', 'f'],
      file: 'doc.rvt',
      v: 'v1',
    });
  });

  it('searches only loaded nodes, case-insensitively, never the root', async () => {
    const { state } = make();
    await state.children('root');
    expect(state.search('hub')).toEqual([]);
    expect(state.search('h').map((entry) => entry.id)).toEqual(['h']);
    await loadAll(state);
    expect(state.search('v2').map((entry) => entry.id)).toEqual(['v2']);
  });

  it('reveals a trail by expanding each ancestor once it is loaded', async () => {
    const { state, open } = make();
    const reveal = state.revealIds(['root', 'h']);
    await state.children('root');
    await state.children('h');
    expect(await reveal).toBe(true);
    expect([...open]).toEqual(['root', 'h']);
  });

  it('stops revealing when cancelled', async () => {
    const { state } = make();
    await state.children('root');
    expect(await state.revealIds(['root'], () => true)).toBe(false);
  });
});

describe('treeState refresh', () => {
  it('refresh forgets the cached query, unloads and invalidates the node', async () => {
    const { state, calls, invalidated } = make();
    await state.children('root');
    state.refresh('root');
    expect(state.isLoaded('root')).toBe(false);
    expect(calls.forget).toEqual(['root']);
    expect(invalidated).toEqual([['root', undefined]]);
  });

  it('refreshAll refreshes root, expanded folders and errors, and marks other loaded nodes stale', async () => {
    const { state, calls, invalidated, open } = make();
    await loadAll(state);
    open.add('p');
    state.refreshAll();
    expect(invalidated.map(([id]) => id).sort()).toEqual(['p', 'root']);
    expect(calls.forget.sort()).toEqual(['p', 'root']);
    expect(state.isLoaded('h')).toBe(true);
    open.add('h');
    state.refreshStale();
    expect(invalidated.map(([id]) => id)).toContain('h');
    expect(state.isLoaded('h')).toBe(false);
    const before = invalidated.length;
    state.refreshStale();
    expect(invalidated.length).toBe(before);
  });

  it('recheck forgets checks and invalidates keeping the children', async () => {
    const { state, invalidated } = make();
    await loadAll(state);
    state.recheck('doc.rvt');
    expect(invalidated).toEqual([['doc.rvt', true]]);
  });

  it('resort invalidates every loaded folder', async () => {
    const { state, invalidated } = make();
    await state.children('root');
    await state.children('h');
    state.resort();
    expect(invalidated.map(([id]) => id).sort()).toEqual(['h', 'root']);
  });
});

describe('treeState checks', () => {
  const unchecked = (id: string, parentId: string) =>
    version(id, parentId, { checked: false, viewState: 'unknown' });

  function withUnchecked(overrides: Partial<TreeData> = {}) {
    const made = make({
      children: async (scope) => {
        const id = scope.kind === 'root' ? 'root' : scope.id;
        if (id === 'doc.rvt') return [unchecked('u1', 'doc.rvt')];
        return TREE[id] ?? [];
      },
      ...overrides,
    });
    return made;
  }

  it('checks an unchecked version once and resolves it afterwards', async () => {
    const viewState = vi.fn(
      async (): Promise<VersionViewState> => ({
        viewState: 'failed',
        viewable: false,
      }),
    );
    const { state } = withUnchecked({ viewState });
    await loadAll(state);
    const u1 = state.node('u1');
    if (!u1) throw new Error('u1 missing');
    expect(state.needsCheck(u1)).toBe(true);
    const [a, b] = await Promise.all([
      state.ensureChecked(u1),
      state.ensureChecked(u1),
    ]);
    expect(viewState).toHaveBeenCalledTimes(1);
    expect(viewState).toHaveBeenCalledWith('p', 'doc.rvt', 'u1');
    expect(a.viewState).toBe('failed');
    expect(b.checked).toBe(true);
    expect(state.resolved(u1)).toMatchObject({
      viewState: 'failed',
      checked: true,
    });
    expect(state.getSnapshot().checkVersion).toBe(1);
  });

  it('leaves the node unchecked when the check fails or is unknown', async () => {
    const { state } = withUnchecked({
      viewState: async () => {
        throw new Error('rate limit');
      },
    });
    await loadAll(state);
    const u1 = state.node('u1');
    if (!u1) throw new Error('u1 missing');
    expect((await state.ensureChecked(u1)).checked).toBe(false);
    expect(state.getSnapshot().checkVersion).toBe(0);
  });

  it('runs at most CHECK_CONCURRENCY checks at once', async () => {
    let running = 0;
    let peak = 0;
    const releases: (() => void)[] = [];
    const many = Array.from({ length: CHECK_CONCURRENCY + 2 }, (_, index) =>
      unchecked(`m${index}`, 'doc.rvt'),
    );
    const { state } = withUnchecked({
      children: async (scope) => {
        const id = scope.kind === 'root' ? 'root' : scope.id;
        return id === 'doc.rvt' ? many : (TREE[id] ?? []);
      },
      viewState: () =>
        new Promise((resolve) => {
          running += 1;
          peak = Math.max(peak, running);
          releases.push(() => {
            running -= 1;
            resolve({ viewState: 'ready', viewable: true });
          });
        }),
    });
    await loadAll(state);
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const done = Promise.all(many.map((entry) => state.ensureChecked(entry)));
    await tick();
    expect(releases.length).toBe(CHECK_CONCURRENCY);
    releases[0]?.();
    await tick();
    expect(releases.length).toBe(CHECK_CONCURRENCY + 1);
    for (const release of releases.slice(1)) release();
    await tick();
    releases[CHECK_CONCURRENCY + 1]?.();
    await done;
    expect(peak).toBe(CHECK_CONCURRENCY);
  });
});

describe('treeState polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keys on parents holding processing or unknown versions', async () => {
    const { state } = make();
    expect(state.pendingKey()).toBe('');
    await loadAll(state);
    expect(state.pendingKey()).toBe('doc.rvt');
  });

  it('rechecks expanded pending parents on every tick while processing', async () => {
    const { state, invalidated, open } = make();
    await loadAll(state);
    open.add('doc.rvt');
    const stop = state.poll(state.pendingKey(), 1000);
    vi.advanceTimersByTime(5000);
    stop();
    expect(invalidated).toEqual(Array(5).fill(['doc.rvt', true]));
  });

  it('skips collapsed parents and does nothing without pending parents', async () => {
    const { state, invalidated } = make();
    await loadAll(state);
    const stop = state.poll(state.pendingKey(), 1000);
    vi.advanceTimersByTime(3000);
    stop();
    state.poll('', 1000)();
    expect(invalidated).toEqual([]);
  });

  it('gives up after a few attempts for unknown versions and resets when collapsed', async () => {
    const { state, invalidated, open } = make({
      children: async (scope) => {
        const id = scope.kind === 'root' ? 'root' : scope.id;
        if (id === 'doc.rvt') {
          return [version('u', 'doc.rvt', { viewState: 'unknown' })];
        }
        return TREE[id] ?? [];
      },
    });
    await loadAll(state);
    open.add('doc.rvt');
    const stop = state.poll(state.pendingKey(), 1000);
    vi.advanceTimersByTime(10_000);
    expect(invalidated.length).toBe(3);
    state.forgetCollapsed([]);
    vi.advanceTimersByTime(10_000);
    stop();
    expect(invalidated.length).toBe(6);
  });
});

describe('treeState picking', () => {
  async function loaded(extra: TreeNode[] = []) {
    const made = make({
      children: async (scope) => {
        const id = scope.kind === 'root' ? 'root' : scope.id;
        if (id === 'doc.rvt') {
          return [
            version('v1', 'doc.rvt', { name: 'v1: a' }),
            version('v2', 'doc.rvt', { name: 'v2: b' }),
            version('v3', 'doc.rvt', { name: 'v3: c', viewState: 'failed' }),
            version('v4', 'doc.rvt', { name: 'v4: d' }),
            ...extra,
          ];
        }
        return TREE[id] ?? [];
      },
    });
    await loadAll(made.state);
    return made;
  }

  const get = (
    state: { node: (id: string) => TreeNode | undefined },
    id: string,
  ) => {
    const found = state.node(id);
    if (!found) throw new Error(`${id} missing`);
    return found;
  };

  it('toggles a version in and out of the selection with its context', async () => {
    const { state } = await loaded();
    state.togglePick(get(state, 'v1'));
    expect(state.getSnapshot().picked).toEqual([
      { urn: 'urn:v1', context: state.contextFor(get(state, 'v1')) },
    ]);
    state.togglePick(get(state, 'v1'));
    expect(state.getSnapshot().picked).toEqual([]);
  });

  it('turns a blocked pick into a notice instead of a selection', async () => {
    const { state } = await loaded();
    state.togglePick(get(state, 'v3'));
    expect(state.getSnapshot().picked).toEqual([]);
    expect(state.getSnapshot().notice).toMatchObject({
      title: 'v3 cannot be opened',
      itemId: 'doc.rvt',
    });
    state.dismissNotice();
    expect(state.getSnapshot().notice).toBeNull();
  });

  it('picks the range from the anchor and skips blocked versions with a notice', async () => {
    const { state } = await loaded();
    const listed = ['v1', 'v2', 'v3', 'v4'].map((id) => get(state, id));
    state.togglePick(get(state, 'v1'));
    state.pickRange(get(state, 'v4'), listed);
    expect(state.getSnapshot().picked.map((model) => model.urn)).toEqual([
      'urn:v1',
      'urn:v2',
      'urn:v4',
    ]);
    expect(state.getSnapshot().notice).toEqual(
      skippedNotice([get(state, 'v3')]),
    );
  });

  it('range without an anchor picks the single version', async () => {
    const { state } = await loaded();
    const listed = ['v1', 'v2'].map((id) => get(state, id));
    state.pickRange(get(state, 'v2'), listed);
    expect(state.getSnapshot().picked.map((model) => model.urn)).toEqual([
      'urn:v2',
    ]);
  });

  it('checks unchecked versions before picking them', async () => {
    const { state } = await loaded([
      version('u1', 'doc.rvt', {
        checked: false,
        viewState: 'unknown',
        urn: 'urn:u1',
      }),
    ]);
    state.togglePick(get(state, 'u1'));
    await vi.waitFor(() =>
      expect(state.getSnapshot().picked.map((model) => model.urn)).toEqual([
        'urn:u1',
      ]),
    );
  });

  it('clears the selection', async () => {
    const { state } = await loaded();
    state.togglePick(get(state, 'v1'));
    state.clearPicked();
    expect(state.getSnapshot().picked).toEqual([]);
  });
});

describe('treeState open decisions', () => {
  async function loaded(data: Partial<TreeData> = {}) {
    const made = make({
      children: async (scope) => {
        const id = scope.kind === 'root' ? 'root' : scope.id;
        if (id === 'doc.rvt') {
          return [
            version('v1', 'doc.rvt', { name: 'v1: a' }),
            version('v2', 'doc.rvt', { name: 'v2: b', viewState: 'failed' }),
            version('u1', 'doc.rvt', {
              name: 'v3: c',
              checked: false,
              viewState: 'unknown',
            }),
          ];
        }
        return TREE[id] ?? [];
      },
      ...data,
    });
    await loadAll(made.state);
    return made;
  }

  const get = (
    state: { node: (id: string) => TreeNode | undefined },
    id: string,
  ) => {
    const found = state.node(id);
    if (!found) throw new Error(`${id} missing`);
    return found;
  };

  it('hands an openable version to the caller synchronously and clears the notice', async () => {
    const { state } = await loaded();
    state.open(get(state, 'v2'), () => undefined);
    expect(state.getSnapshot().notice).not.toBeNull();
    const perform = vi.fn();
    state.open(get(state, 'v1'), perform);
    expect(perform).toHaveBeenCalledWith({
      urn: 'urn:v1',
      context: state.contextFor(get(state, 'v1')),
    });
    expect(state.getSnapshot().notice).toBeNull();
  });

  it('explains a version that cannot be opened and does not perform', async () => {
    const { state } = await loaded();
    const perform = vi.fn();
    state.open(get(state, 'v2'), perform);
    expect(perform).not.toHaveBeenCalled();
    expect(state.getSnapshot().notice).toMatchObject({
      title: 'v2 cannot be opened',
      itemId: 'doc.rvt',
    });
  });

  it('checks an unchecked version first, then decides on the result', async () => {
    const { state } = await loaded({
      viewState: async () => ({ viewState: 'ready', viewable: true }),
    });
    const perform = vi.fn();
    state.open({ ...get(state, 'u1'), urn: 'urn:u1' }, perform);
    expect(perform).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(perform).toHaveBeenCalled());
    expect(perform.mock.calls[0]?.[0].urn).toBe('urn:u1');
  });

  it('blocks an unchecked version that turns out not to be viewable', async () => {
    const { state } = await loaded({
      viewState: async () => ({ viewState: 'no-geometry', viewable: false }),
    });
    const perform = vi.fn();
    state.open({ ...get(state, 'u1'), urn: 'urn:u1' }, perform);
    await vi.waitFor(() =>
      expect(state.getSnapshot().notice?.title).toBe('v3 cannot be opened'),
    );
    expect(perform).not.toHaveBeenCalled();
  });

  it('add hands the checked version to the caller, or explains why not', async () => {
    const { state } = await loaded();
    const perform = vi.fn();
    state.add(get(state, 'v1'), perform);
    await vi.waitFor(() => expect(perform).toHaveBeenCalledTimes(1));
    expect(perform.mock.calls[0]?.[0]).toHaveLength(1);
    state.add(get(state, 'v2'), perform);
    await vi.waitFor(() => expect(state.getSnapshot().notice).not.toBeNull());
    expect(perform).toHaveBeenCalledTimes(1);
  });

  it('check again rechecks the folder and dismisses the notice', async () => {
    const { state, invalidated } = await loaded();
    state.open(get(state, 'v2'), () => undefined);
    state.checkAgain('doc.rvt');
    expect(invalidated).toContainEqual(['doc.rvt', true]);
    expect(state.getSnapshot().notice).toBeNull();
  });
});

describe('treeState item references', () => {
  it('builds a version target from an item and from its versions', async () => {
    const { state } = make();
    await loadAll(state);
    const item = state.node('doc.rvt');
    if (!item) throw new Error('item missing');
    const target = state.itemRef(item);
    expect(target).toEqual({
      projectId: 'p',
      itemId: 'doc.rvt',
      file: 'doc.rvt',
      trail: [...state.ancestorIds(item), 'doc.rvt'],
      crumbs: ['Hubs', 'h', 'p', 'f'],
    });
    const versionNode = state.node('v1');
    if (!versionNode) throw new Error('version missing');
    expect(state.itemRef(versionNode)).toEqual(target);
  });

  it('returns null for a folder, a hub or an item without a project', async () => {
    const { state } = make();
    await loadAll(state);
    const folder = state.node('f');
    const root = state.node('root');
    if (!folder || !root) throw new Error('fixtures missing');
    expect(state.itemRef(folder)).toBeNull();
    expect(state.itemRef(root)).toBeNull();
  });
});

describe('tab and combined limits', () => {
  it('reports no message below both limits and a tab or combined message above', () => {
    expect(pickLimit(0, 1)).toEqual({
      tooManyTabs: false,
      tooManyCombined: false,
      message: null,
    });

    const tabs = pickLimit(MAX_LOADED_MEMBERS - 1, 2);
    expect(tabs.tooManyTabs).toBe(true);
    expect(tabs.message).toBe(tabLimitMessage(MAX_LOADED_MEMBERS - 1));
    expect(tabs.message).toContain('Select 1 or fewer');
    expect(tabLimitMessage(MAX_LOADED_MEMBERS)).toContain('Close a model');
    expect(tabLimitMessage(1)).toContain('1 model is already loaded');

    const picked = MAX_COMBINED_MODELS + 1;
    const combined = pickLimit(0, picked);
    expect(combined.tooManyCombined).toBe(picked > MAX_COMBINED_MODELS);
    if (!combined.tooManyTabs) {
      expect(combined.message).toBe(MODEL_LIMIT_MESSAGE);
    }
  });

  it('shares one rule with the tab-open check', () => {
    for (
      let loadedCount = 0;
      loadedCount <= MAX_LOADED_MEMBERS;
      loadedCount += 1
    ) {
      for (let picked = 0; picked <= MAX_LOADED_MEMBERS + 1; picked += 1) {
        expect(pickLimit(loadedCount, picked).tooManyTabs).toBe(
          overTabLimit(loadedCount, picked),
        );
      }
    }
  });
});
