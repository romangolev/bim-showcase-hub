import { describe, expect, it, vi } from 'vitest';
import { createOpenModelsStore } from '../api/openModels.js';
import {
  createLayoutApply,
  DOCK_ONLY_REASON,
  LOCKED_REASON,
} from './layoutApply.js';
import type { DockController, LayoutMode } from './layoutContext.js';
import { encodeShare } from './layoutShare.js';
import { defaultModel, type SerializedDock } from './layoutState.js';
import type { PaneAppearances } from './paneAppearance.js';
import { createPaneLifecycle } from './paneLifecycle.js';
import { PRESETS, serializeWorkspace, type Workspace } from './workspaces.js';

const dock = (): DockController => ({
  movePane: vi.fn(),
  openPane: vi.fn(),
  closePane: vi.fn(),
  reset: vi.fn(),
  apply: vi.fn(),
  focusPane: vi.fn(),
  toggleMaximize: vi.fn(() => true),
  location: vi.fn(() => 'grid' as const),
  resizePane: vi.fn(() => ({ width: 10, height: 20 })),
});

const oneTab: SerializedDock = {
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
          data: { id: '2', views: ['summary'], activeView: 'summary' },
        },
      ],
    },
    width: 1440,
    height: 844,
    orientation: 'HORIZONTAL',
  },
  panels: {
    tree: { id: 'tree', contentComponent: 'pane', title: 'Documents' },
    summary: { id: 'summary', contentComponent: 'pane', title: 'Summary' },
  },
};
const layoutWithDock = () => ({
  ...defaultModel(),
  dock: oneTab,
  collapsed: [],
});

const titled = (title: string): PaneAppearances => ({ summary: { title } });
const review = PRESETS.find((preset) => preset.id === 'review');
if (!review) throw new Error('review preset missing');

function setup(options: { locked?: boolean; mode?: LayoutMode } = {}) {
  const controller = dock();
  let mode: LayoutMode = options.mode ?? 'dock';
  let current: PaneAppearances = titled('Original');
  const replace = vi.fn((next: PaneAppearances) => {
    current = next;
  });
  const lifecycle = createPaneLifecycle({
    models: createOpenModelsStore(null),
    dock: () => controller,
    mode: () => mode,
    hosts: { release: vi.fn() },
    persist: { user: vi.fn(), locked: vi.fn() },
    settings: { seed: vi.fn(), forget: vi.fn() },
    focus: { treeInput: vi.fn(), treeTarget: vi.fn(), toggle: vi.fn() },
    later: (run) => run(),
    title: (id) => ({ label: id, tooltip: '' }),
    initial: {
      layout: defaultModel(),
      user: {},
      locked: options.locked ?? false,
    },
  });
  const notify = vi.spyOn(lifecycle, 'notify');
  const apply = createLayoutApply({
    lifecycle,
    appearances: { read: () => current, replace },
  });
  const saved = (appearances: PaneAppearances): Workspace => ({
    id: 'w1',
    name: 'Saved',
    layout: { ...defaultModel(), collapsed: [] },
    appearances,
  });
  return {
    apply,
    lifecycle,
    notify,
    replace,
    saved,
    appearances: () => current,
    setMode: (next: LayoutMode) => {
      mode = next;
    },
  };
}

describe('layoutApply when the layout cannot change', () => {
  it('names the lock, touches nothing and stays inactive', () => {
    const t = setup({ locked: true });
    t.apply.applyPreset(review);
    t.apply.applySaved(t.saved(titled('Theirs')));
    expect(t.notify).toHaveBeenNthCalledWith(1, LOCKED_REASON);
    expect(t.notify).toHaveBeenNthCalledWith(2, LOCKED_REASON);
    expect(t.replace).not.toHaveBeenCalled();
    expect(t.apply.active()).toBeNull();
    expect(t.lifecycle.getState().canRevert).toBe(false);
  });

  it('names the dock requirement outside the dock layout', () => {
    const t = setup({ mode: 'stacked' });
    t.apply.applyPreset(review);
    t.apply.applySaved(t.saved(titled('Theirs')));
    expect(t.notify).toHaveBeenNthCalledWith(1, DOCK_ONLY_REASON);
    expect(t.notify).toHaveBeenNthCalledWith(2, DOCK_ONLY_REASON);
    expect(t.replace).not.toHaveBeenCalled();
    expect(t.apply.active()).toBeNull();
  });

  it('returns the reason for an import without announcing it', () => {
    const locked = setup({ locked: true });
    const text = serializeWorkspace({
      name: 'In',
      layout: layoutWithDock(),
      appearances: titled('Theirs'),
    });
    expect(locked.apply.applyImported(text)).toBe(LOCKED_REASON);
    expect(locked.replace).not.toHaveBeenCalled();
    expect(locked.notify).not.toHaveBeenCalled();
    const stacked = setup({ mode: 'stacked' });
    expect(stacked.apply.applyImported(text)).toBe(DOCK_ONLY_REASON);
    expect(stacked.apply.active()).toBeNull();
  });
});

describe('layoutApply applying', () => {
  it('marks a preset active and leaves appearances alone', () => {
    const t = setup();
    t.apply.applyPreset(review);
    expect(t.apply.active()).toBe('preset:review');
    expect(t.replace).not.toHaveBeenCalled();
    expect(t.lifecycle.getState().canRevert).toBe(true);
  });

  it('replaces appearances after the layout applied and marks the workspace', () => {
    const t = setup();
    const listener = vi.fn();
    t.apply.subscribe(listener);
    t.apply.applySaved(t.saved(titled('Theirs')));
    expect(t.appearances()).toEqual(titled('Theirs'));
    expect(t.apply.active()).toBe('w1');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps appearances when the workspace carries none', () => {
    const t = setup();
    t.apply.applySaved(t.saved({}));
    expect(t.replace).not.toHaveBeenCalled();
  });

  it('imports, clears the active label and says so', () => {
    const t = setup();
    t.apply.applyPreset(review);
    const text = serializeWorkspace({
      name: 'In',
      layout: layoutWithDock(),
      appearances: titled('Theirs'),
    });
    expect(t.apply.applyImported(text)).toBeNull();
    expect(t.apply.active()).toBeNull();
    expect(t.appearances()).toEqual(titled('Theirs'));
    expect(t.notify).toHaveBeenCalledWith('Layout In imported');
  });

  it('returns the parse error for an unreadable import', () => {
    const t = setup();
    expect(t.apply.applyImported('nope')).toBe('This is not valid JSON.');
    expect(t.lifecycle.getState().canRevert).toBe(false);
  });
});

describe('layoutApply revert', () => {
  it('restores layout and appearances together and clears the label', () => {
    const t = setup();
    t.apply.applySaved(t.saved(titled('Theirs')));
    t.apply.revert();
    expect(t.appearances()).toEqual(titled('Original'));
    expect(t.apply.active()).toBeNull();
    expect(t.lifecycle.getState().canRevert).toBe(false);
  });

  it('does not restore appearances after a preset replaced the snapshot', () => {
    const t = setup();
    t.apply.applySaved(t.saved(titled('Theirs')));
    t.apply.applyPreset(review);
    t.replace.mockClear();
    t.apply.revert();
    expect(t.replace).not.toHaveBeenCalled();
  });

  it('restores neither while locked', () => {
    const t = setup();
    t.apply.applySaved(t.saved(titled('Theirs')));
    t.lifecycle.setLocked(true);
    t.replace.mockClear();
    t.apply.revert();
    expect(t.replace).not.toHaveBeenCalled();
    expect(t.apply.active()).toBe('w1');
    expect(t.lifecycle.getState().canRevert).toBe(true);
  });

  it('does nothing when there is nothing to revert', () => {
    const t = setup();
    t.apply.setActive('w9');
    t.apply.revert();
    expect(t.apply.active()).toBe('w9');
  });
});

describe('layoutApply shared link', () => {
  const payload = (appearances: PaneAppearances) =>
    encodeShare(
      serializeWorkspace({
        name: 'Shared',
        layout: layoutWithDock(),
        appearances,
      }),
    );

  it('applies the layout and its appearances without touching the label', async () => {
    const t = setup();
    t.apply.setActive('w9');
    await t.apply.applyShared(await payload(titled('Theirs')));
    expect(t.appearances()).toEqual(titled('Theirs'));
    expect(t.apply.active()).toBe('w9');
    expect(t.lifecycle.getState().canRevert).toBe(true);
  });

  it('names the lock and keeps appearances', async () => {
    const t = setup({ locked: true });
    await t.apply.applyShared(await payload(titled('Theirs')));
    expect(t.notify).toHaveBeenCalledWith(LOCKED_REASON);
    expect(t.replace).not.toHaveBeenCalled();
  });

  it('says so when the payload is unreadable', async () => {
    const t = setup();
    await t.apply.applyShared('j%%%');
    expect(t.notify).toHaveBeenCalledWith(
      'This share link is not a readable layout.',
    );
  });
});
