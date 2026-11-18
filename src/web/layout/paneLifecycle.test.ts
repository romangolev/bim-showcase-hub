import { describe, expect, it, vi } from 'vitest';
import { createOpenModelsStore } from '../api/openModels.js';
import type { DockController, LayoutMode } from './layoutContext.js';
import { defaultModel, type SerializedDock } from './layoutState.js';
import { createPaneLifecycle } from './paneLifecycle.js';
import type { PanelId } from './paneRegistry.js';
import type { UserInstances } from './userInstances.js';

function fakeDock(): DockController {
  return {
    movePane: vi.fn(),
    openPane: vi.fn(),
    closePane: vi.fn(),
    reset: vi.fn(),
    focusPane: vi.fn(),
    toggleMaximize: vi.fn(() => true),
    location: vi.fn(() => 'grid' as const),
    resizePane: vi.fn(() => ({ width: 10, height: 20 })),
  };
}

function dockWith(...ids: string[]): SerializedDock {
  return {
    panels: Object.fromEntries(ids.map((id) => [id, {}])),
  } as unknown as SerializedDock;
}

function setup(
  options: {
    mode?: LayoutMode;
    locked?: boolean;
    user?: UserInstances;
    urns?: string[];
    withDock?: boolean;
  } = {},
) {
  const models = createOpenModelsStore(null);
  for (const urn of options.urns ?? []) models.open(urn);
  const dock = fakeDock();
  let mode: LayoutMode = options.mode ?? 'dock';
  const hosts = { release: vi.fn() };
  const persist = { user: vi.fn(), locked: vi.fn() };
  const settings = { seed: vi.fn(), forget: vi.fn() };
  const focus = { treeInput: vi.fn(), treeTarget: vi.fn(), toggle: vi.fn() };
  const queue: Array<() => void> = [];
  const lifecycle = createPaneLifecycle({
    models,
    dock: () => (options.withDock === false ? null : dock),
    mode: () => mode,
    hosts,
    persist,
    settings,
    focus,
    later: (run) => queue.push(run),
    title: (id) => ({ label: id, tooltip: '' }),
    initial: {
      layout: defaultModel(),
      user: options.user ?? {},
      locked: options.locked ?? false,
    },
  });
  return {
    lifecycle,
    models,
    dock,
    hosts,
    persist,
    settings,
    focus,
    setMode: (next: LayoutMode) => {
      mode = next;
    },
    flush: () => {
      for (const run of queue.splice(0)) run();
    },
  };
}

describe('paneLifecycle instances', () => {
  it('adds user instances at the lowest free number and seeds settings', () => {
    const { lifecycle, settings, persist } = setup({ urns: ['u1'] });
    expect(lifecycle.addInstance('chart')).toBe('chart:1');
    expect(lifecycle.addInstance('chart')).toBe('chart:2');
    lifecycle.closeInstance('chart:1');
    expect(lifecycle.addInstance('chart')).toBe('chart:1');
    expect(settings.seed).toHaveBeenCalledWith('chart:1', 'u1');
    expect(persist.user).toHaveBeenCalledTimes(4);
    expect(lifecycle.view().userPanels).toEqual(['chart:2', 'chart:1']);
  });

  it('caps user instances at 12 per kind', () => {
    const { lifecycle } = setup({ urns: ['u1'] });
    for (let i = 0; i < 12; i += 1)
      expect(lifecycle.addInstance('chart')).not.toBeNull();
    expect(lifecycle.addInstance('chart')).toBeNull();
  });

  it('refuses to add when locked, stacked or for a non-user kind', () => {
    expect(setup({ locked: true }).lifecycle.addInstance('chart')).toBeNull();
    expect(
      setup({ mode: 'stacked' }).lifecycle.addInstance('chart'),
    ).toBeNull();
    expect(setup().lifecycle.addInstance('tree')).toBeNull();
  });

  it('forgets settings when a user instance closes', () => {
    const { lifecycle, settings } = setup({ urns: ['u1'] });
    const id = lifecycle.addInstance('chart') as PanelId;
    lifecycle.closeInstance(id);
    expect(settings.forget).toHaveBeenCalledWith(id);
    expect(lifecycle.view().userPanels).toEqual([]);
  });

  it('keeps user panes hidden in stacked mode at home and restores them', () => {
    const user = { chart: [{ id: 'chart:1', title: 'Chart 1' }] };
    const { lifecycle, models, setMode } = setup({ user, mode: 'stacked' });
    expect(lifecycle.view().instances).toEqual([]);
    setMode('dock');
    expect(lifecycle.view().instances).toEqual(['chart:1']);
    setMode('stacked');
    models.open('u1');
    expect(lifecycle.view().instances).toEqual(['viewer:u1', 'chart:1']);
  });
});

describe('paneLifecycle model tabs', () => {
  it('routes activate and close of a model panel to the store', () => {
    const { lifecycle, models } = setup({ urns: ['a', 'b'] });
    lifecycle.activateInstance('viewer:a');
    expect(models.getState().active).toBe('a');
    lifecycle.togglePane('viewer:b');
    expect(models.getState().models.map((m) => m.urn)).toEqual(['a']);
    lifecycle.closeInstance('viewer:a');
    expect(lifecycle.view().home).toBe(true);
  });

  it('shows a model on attach and reports visibility', () => {
    const { lifecycle, models } = setup({ urns: ['a', 'b'] });
    const show = vi.spyOn(models, 'show');
    const setVisible = vi.spyOn(models, 'setVisible');
    lifecycle.paneAttached('viewer:a');
    expect(show).toHaveBeenCalledWith('a');
    lifecycle.visibility('viewer:a', true);
    lifecycle.visibility('viewer:b', true);
    lifecycle.visibility('viewer:a', false);
    expect(setVisible).toHaveBeenLastCalledWith(['b']);
  });

  it('releases hosts and unmounts instances that left', () => {
    const { lifecycle, models, hosts } = setup({ urns: ['a', 'b'] });
    lifecycle.paneAttached('viewer:a');
    lifecycle.paneAttached('viewer:b');
    lifecycle.paneAttached('tree');
    models.close('b');
    lifecycle.reconcile();
    expect(hosts.release).toHaveBeenCalledWith('viewer:b');
    expect(lifecycle.getState().attached).toEqual(['viewer:a', 'tree']);
  });

  it('floats a pane on attach after floatNext, and straight away if attached', () => {
    const { lifecycle, dock, flush } = setup({ urns: ['a'] });
    lifecycle.floatNext('a');
    lifecycle.paneAttached('viewer:a');
    expect(dock.movePane).not.toHaveBeenCalled();
    flush();
    expect(dock.movePane).toHaveBeenCalledWith('viewer:a', 'float');
    lifecycle.floatNext('a');
    expect(dock.movePane).toHaveBeenCalledTimes(2);
  });

  it('ignores floatNext when locked or stacked', () => {
    const locked = setup({ urns: ['a'], locked: true });
    locked.lifecycle.paneAttached('viewer:a');
    locked.lifecycle.floatNext('a');
    expect(locked.dock.movePane).not.toHaveBeenCalled();
    const stacked = setup({ urns: ['a'], mode: 'stacked' });
    stacked.lifecycle.paneAttached('viewer:a');
    stacked.lifecycle.floatNext('a');
    expect(stacked.dock.movePane).not.toHaveBeenCalled();
  });
});

describe('paneLifecycle panes, lock and present', () => {
  it('closes and reopens a closable pane', () => {
    const { lifecycle, dock } = setup({ urns: ['a'] });
    lifecycle.dockChanged(dockWith('summary'), ['summary']);
    lifecycle.togglePane('summary');
    expect(dock.closePane).toHaveBeenCalledWith('summary');
    expect(lifecycle.view().companions).not.toContain('summary');
    lifecycle.dockChanged(dockWith(), []);
    lifecycle.togglePane('summary');
    expect(dock.openPane).toHaveBeenCalledWith('summary');
    expect(lifecycle.view().companions).toContain('summary');
  });

  it('blocks layout edits while locked and persists the lock', () => {
    const { lifecycle, dock, persist } = setup({ locked: true });
    lifecycle.movePane('viewer', 'left');
    lifecycle.resetLayout();
    lifecycle.setCollapsed('dashboard', false);
    expect(dock.movePane).not.toHaveBeenCalled();
    expect(dock.reset).not.toHaveBeenCalled();
    lifecycle.setLocked(false);
    expect(persist.locked).toHaveBeenCalledWith(false);
    expect(lifecycle.getState().announcement).toBe('Layout unlocked');
    lifecycle.movePane('viewer', 'left');
    expect(dock.movePane).toHaveBeenCalledWith('viewer', 'left');
  });

  it('syncs external persisted changes', () => {
    const { lifecycle } = setup();
    lifecycle.sync({
      locked: true,
      user: { chart: [{ id: 'chart:3', title: 'x' }] },
    });
    expect(lifecycle.getState().locked).toBe(true);
    expect(lifecycle.view().userPanels).toEqual(['chart:3']);
  });

  it('enters and leaves presentation, restoring the maximize it caused', () => {
    const { lifecycle, dock } = setup();
    lifecycle.setPresenting(true);
    expect(lifecycle.getState().presenting).toBe(true);
    lifecycle.setPresenting(false);
    expect(dock.toggleMaximize).toHaveBeenCalledTimes(2);
    expect(lifecycle.getState().presenting).toBe(false);
  });

  it('does not unmaximize a viewer that was maximized before presenting', () => {
    const { lifecycle, dock } = setup();
    lifecycle.maximizedChanged('viewer');
    lifecycle.setPresenting(true);
    lifecycle.setPresenting(false);
    expect(dock.toggleMaximize).not.toHaveBeenCalled();
  });

  it('runs a resize session', () => {
    const { lifecycle, dock } = setup();
    lifecycle.startResize('viewer');
    lifecycle.resize({ width: 16 });
    expect(dock.resizePane).toHaveBeenCalledWith('viewer', { width: 16 });
    expect(lifecycle.getState().announcement).toBe('viewer 10 by 20 pixels');
    lifecycle.finishResize();
    expect(lifecycle.getState().resizing).toBeNull();
  });

  it('drops the overlay and a resize session when the mode changes', () => {
    const { lifecycle, models, setMode } = setup({ mode: 'stacked' });
    models.open('a');
    lifecycle.toggleTree();
    setMode('dock');
    lifecycle.modeChanged();
    expect(lifecycle.getState().overlayTreeOpen).toBe(false);
    lifecycle.startResize('viewer');
    setMode('stacked');
    lifecycle.modeChanged();
    expect(lifecycle.getState().resizing).toBeNull();
  });

  it('opens the tree overlay in stacked mode only when a model is open', () => {
    const { lifecycle, models, focus } = setup({ mode: 'stacked' });
    lifecycle.toggleTree();
    expect(lifecycle.view().overlayOpen).toBe(false);
    models.open('a');
    lifecycle.toggleTree();
    expect(lifecycle.view().overlayOpen).toBe(true);
    lifecycle.closeTreeOverlay();
    expect(lifecycle.view().overlayOpen).toBe(false);
    expect(focus.toggle).toHaveBeenCalled();
  });

  it('tolerates a dock that has not mounted yet', () => {
    const { lifecycle } = setup({ withDock: false, urns: ['a'] });
    expect(() => {
      lifecycle.movePane('viewer', 'left');
      lifecycle.resetLayout();
      lifecycle.toggleTree();
      lifecycle.setPresenting(true);
    }).not.toThrow();
  });
});
