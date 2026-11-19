import { beforeEach, describe, expect, it } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import {
  defaultModel,
  type LayoutModel,
  type SerializedDock,
} from './layoutState.js';
import { type PaneId, parsePanelId } from './paneRegistry.js';
import {
  emptyWorkspaces,
  MAX_WORKSPACES,
  PRESETS,
  removeWorkspace,
  renameWorkspace,
  sanitizeWorkspaces,
  saveWorkspace,
  WORKSPACES_KEY,
  WORKSPACES_RECORD,
  type Workspace,
  type WorkspaceStore,
} from './workspaces.js';

const dock: SerializedDock = {
  grid: {
    root: {
      type: 'branch',
      size: 900,
      data: [
        {
          type: 'leaf',
          size: 320,
          data: { id: '1', views: ['tree'], activeView: 'tree' },
        },
        {
          type: 'leaf',
          size: 580,
          data: { id: '2', views: ['viewer:m1'], activeView: 'viewer:m1' },
        },
      ],
    },
    width: 1440,
    height: 844,
    orientation: 'HORIZONTAL',
  },
  panels: {
    tree: { id: 'tree', contentComponent: 'pane', title: 'Documents' },
    'viewer:m1': { id: 'viewer:m1', contentComponent: 'pane', title: 'Model' },
  },
};

const model: LayoutModel = {
  ...defaultModel(),
  dock,
  collapsed: ['dashboard'],
  treeWidth: 320,
};

function saved(store: WorkspaceStore, name: string): Workspace {
  const found = store.items.find((item) => item.name === name);
  if (!found) throw new Error(`missing workspace ${name}`);
  return found;
}

beforeEach(() => {
  installMemoryStorage();
});

describe('workspace store', () => {
  it('saves, renames and deletes a workspace', () => {
    const first = saveWorkspace(emptyWorkspaces(), 'House', model, {});
    expect(first).not.toBeNull();
    if (!first) return;
    expect(first.store.items).toHaveLength(1);
    expect(first.workspace.layout.treeWidth).toBe(320);

    const renamed = renameWorkspace(first.store, first.workspace.id, 'Tower');
    expect(saved(renamed, 'Tower').id).toBe(first.workspace.id);

    const duplicate = renameWorkspace(renamed, first.workspace.id, 'Tower');
    expect(duplicate).toBe(renamed);
    const clash = saveWorkspace(renamed, 'Tower', model, {});
    expect(clash?.workspace.id).toBe(first.workspace.id);
    expect(clash?.store.items).toHaveLength(1);
    expect(renameWorkspace(renamed, 'missing', 'Other')).toBe(renamed);

    const empty = removeWorkspace(renamed, first.workspace.id);
    expect(empty.items).toEqual([]);
    expect(removeWorkspace(empty, 'missing')).toBe(empty);
  });

  it('keeps one entry per name case-insensitively and caps the list', () => {
    let store = emptyWorkspaces();
    store = saveWorkspace(store, 'House', model, {})?.store ?? store;
    store =
      saveWorkspace(store, 'house', { ...model, treeWidth: 400 }, {})?.store ??
      store;
    expect(store.items).toHaveLength(1);
    expect(store.items[0]?.layout.treeWidth).toBe(400);
    for (let n = 0; n < MAX_WORKSPACES + 3; n += 1) {
      store = saveWorkspace(store, `Workspace ${n}`, model, {})?.store ?? store;
    }
    expect(store.items).toHaveLength(MAX_WORKSPACES);
  });

  it('persists under the versioned key and reads it back', () => {
    const result = saveWorkspace(emptyWorkspaces(), 'House', model, {
      summary: { color: 'blue' },
    });
    if (!result) throw new Error('save failed');
    expect(WORKSPACES_RECORD.write(result.store)).toBe(true);
    expect(window.localStorage.getItem(WORKSPACES_KEY)).toContain('House');
    const stored = WORKSPACES_RECORD.read();
    expect(stored.items).toHaveLength(1);
    expect(stored.items[0]?.appearances).toEqual({
      summary: { color: 'blue' },
    });
  });

  it('falls back to no workspaces for a corrupt or newer payload', () => {
    expect(sanitizeWorkspaces(null).items).toEqual([]);
    expect(sanitizeWorkspaces({ version: 1, items: 'nope' }).items).toEqual([]);
    expect(
      sanitizeWorkspaces({ version: 2, items: [{ name: 'House' }] }),
    ).toEqual({ version: 1, items: [] });
    window.localStorage.setItem(
      WORKSPACES_KEY,
      JSON.stringify({ version: 7, items: [{ name: 'Future' }] }),
    );
    expect(WORKSPACES_RECORD.read().items).toEqual([]);
  });

  it('skips a broken entry and keeps the valid one', () => {
    const raw = {
      version: 1,
      items: [
        { name: 'Broken', layout: { dock: 'nope' } },
        { name: 'Empty', layout: defaultModel() },
        { id: 'kept', name: '  House  ', layout: model },
      ],
    };
    const clean = sanitizeWorkspaces(raw);
    expect(clean.items).toHaveLength(1);
    expect(clean.items[0]?.name).toBe('House');
    expect(clean.items[0]?.id).toBe('kept');
  });
});

describe('built-in presets', () => {
  it('offers Review, Data, Present and Coordination', () => {
    expect(PRESETS.map((preset) => preset.name)).toEqual([
      'Review',
      'Data',
      'Present',
      'Coordination',
    ]);
    const present = PRESETS.find((preset) => preset.id === 'present');
    expect(present?.steps).toBeNull();
  });

  it('places every pane after the pane it references', () => {
    for (const preset of PRESETS) {
      if (!preset.steps) continue;
      const placed = new Set<PaneId>();
      for (const step of preset.steps ?? []) {
        expect(parsePanelId(step.id)).not.toBeNull();
        if (step.placement.kind === 'tab') {
          expect(placed.has(step.placement.reference)).toBe(true);
        }
        if (step.placement.kind === 'beside') {
          expect(placed.has(step.placement.reference)).toBe(true);
        }
        placed.add(step.id);
      }
      expect(placed.size).toBeGreaterThan(1);
    }
  });
});
