import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hexToRgba, resolvePaintPalette } from '../extensions/paintBrushes.js';
import { ModalProvider } from '../modal/index.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { PaintTool } from '../tools/paint/PaintTool.js';
import {
  DEFAULT_PAINT_SETTINGS,
  PAINT_SETTINGS,
} from '../tools/paint/paintSettings.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { CommandPalette } from './CommandPalette.js';
import { COMMANDS } from './registry.js';
import { parseShortcut } from './shortcuts.js';
import { viewerCommands } from './viewerCommands.js';
import { viewerShortcuts } from './viewerShortcutMap.js';

const SOURCE = 'viewer-shortcuts-test';
const DOCK_SOURCE = 'dock-scope-test';

beforeEach(() => {
  installMemoryStorage();
  COMMANDS.register(SOURCE, () => []);
});

afterEach(() => {
  COMMANDS.register(SOURCE, () => []);
  COMMANDS.register(DOCK_SOURCE, () => []);
});

function fakeAdapter() {
  const selection = [{ modelId: 'a', dbId: 1 }];
  const visible = [
    { modelId: 'a', dbId: 2 },
    { modelId: 'a', dbId: 3 },
  ];
  return {
    getModels: () => [
      { id: 'a', urn: 'urn-a', status: 'ready' as const, version: '1' },
    ],
    getModelSelection: () => selection,
    getVisible: async () => visible,
    selectModelIds: vi.fn(),
    isolateModelIds: vi.fn(),
    hideModelIds: vi.fn(),
    showAll: vi.fn(),
    clearSelection: vi.fn(),
    setModelThemingColor: vi.fn(),
    clearModelThemingColors: vi.fn(),
  } as unknown as ViewerAdapter;
}

function keyEvent(keys: string) {
  const spec = parseShortcut(keys);
  if (!spec) throw new Error(`bad shortcut ${keys}`);
  return {
    key: spec.key,
    code: `Key${spec.key.toUpperCase()}`,
    ctrlKey: spec.mod,
    altKey: spec.alt,
    shiftKey: spec.shift,
  };
}

function renderPalette(adapter: ViewerAdapter) {
  COMMANDS.register(SOURCE, () => viewerCommands(adapter));
  return render(
    <ModalProvider definitions={[]}>
      <CommandPalette />
    </ModalProvider>,
  );
}

function viewerPane() {
  const pane = document.createElement('div');
  pane.className = 'bsh-viewer-pane';
  document.body.append(pane);
  return pane;
}

describe('viewer shortcuts', () => {
  it('exposes every binding on its command', () => {
    const commands = viewerCommands(fakeAdapter());
    for (const shortcut of viewerShortcuts()) {
      const command = commands.find((entry) => entry.id === shortcut.command);
      expect(command?.keys).toEqual([shortcut.keys]);
      expect(command?.scope).toBe('viewer');
    }
  });

  it('binds the requested selection and paint actions', () => {
    const bindings = new Map(
      viewerShortcuts().map((shortcut) => [shortcut.command, shortcut.keys]),
    );
    expect(bindings.get('viewer.isolate')).toBe('i');
    expect(bindings.get('viewer.hide')).toBe('h');
    expect(bindings.get('viewer.showAll')).toBe('shift+h');
    expect(bindings.get('viewer.invertSelection')).toBe('mod+i');
    expect(bindings.get('viewer.undoPaint')).toBe('mod+z');
  });

  it('keeps bindings unique, parseable and clear of the app and layout keys', () => {
    const keys = viewerShortcuts().map((shortcut) => shortcut.keys);
    expect(new Set(keys).size).toBe(keys.length);
    const reserved = ['mod+k', 'mod+alt+t', 'mod+alt+p', 'mod+alt+l'];
    for (const binding of keys) {
      expect(reserved).not.toContain(binding);
      expect(parseShortcut(binding)).not.toBeNull();
    }
  });

  it('runs the matching command for every binding', async () => {
    const adapter = fakeAdapter();
    renderPalette(adapter);
    for (const { keys } of viewerShortcuts()) {
      fireEvent.keyDown(document, keyEvent(keys));
    }
    await Promise.resolve();
    expect(adapter.isolateModelIds).toHaveBeenCalledWith([
      { modelId: 'a', dbId: 1 },
    ]);
    expect(adapter.hideModelIds).toHaveBeenCalledWith([
      { modelId: 'a', dbId: 1 },
    ]);
    expect(adapter.showAll).toHaveBeenCalledOnce();
    expect(adapter.selectModelIds).toHaveBeenCalledWith([
      { modelId: 'a', dbId: 2 },
      { modelId: 'a', dbId: 3 },
    ]);
    expect(adapter.setModelThemingColor).toHaveBeenCalledWith(
      [{ modelId: 'a', dbId: 1 }],
      hexToRgba(
        resolvePaintPalette(
          DEFAULT_PAINT_SETTINGS.paletteId,
          DEFAULT_PAINT_SETTINGS.palette,
        )[0] ?? '',
        DEFAULT_PAINT_SETTINGS.intensity,
      ),
    );
    expect(adapter.clearModelThemingColors).toHaveBeenCalledWith([
      { modelId: 'a', dbId: 1 },
    ]);
  });

  it('skips editable targets and open dialogs', () => {
    const adapter = fakeAdapter();
    renderPalette(adapter);
    const binding = keyEvent(
      viewerShortcuts().find(
        (shortcut) => shortcut.command === 'viewer.isolate',
      )?.keys ?? '',
    );
    const field = document.createElement('input');
    document.body.append(field);
    fireEvent.keyDown(field, binding);
    expect(adapter.isolateModelIds).not.toHaveBeenCalled();
    field.remove();

    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.append(dialog);
    fireEvent.keyDown(document, binding);
    expect(adapter.isolateModelIds).not.toHaveBeenCalled();
    dialog.remove();

    fireEvent.keyDown(document, binding);
    expect(adapter.isolateModelIds).toHaveBeenCalledOnce();
  });

  it('does nothing when the user types the plain keys into a field', () => {
    const adapter = fakeAdapter();
    renderPalette(adapter);
    const field = document.createElement('input');
    document.body.append(field);
    for (const command of [
      'viewer.isolate',
      'viewer.hide',
      'viewer.showAll',
      'viewer.invertSelection',
      'viewer.undoPaint',
    ]) {
      const keys =
        viewerShortcuts().find((shortcut) => shortcut.command === command)
          ?.keys ?? '';
      fireEvent.keyDown(field, keyEvent(keys));
    }
    expect(adapter.isolateModelIds).not.toHaveBeenCalled();
    expect(adapter.hideModelIds).not.toHaveBeenCalled();
    expect(adapter.showAll).not.toHaveBeenCalled();
    expect(adapter.selectModelIds).not.toHaveBeenCalled();
    expect(adapter.clearModelThemingColors).not.toHaveBeenCalled();
    field.remove();
  });

  it('keeps plain keys and paint undo out of other panes', () => {
    const adapter = fakeAdapter();
    renderPalette(adapter);
    const elsewhere = document.createElement('div');
    const pane = document.createElement('div');
    pane.className = 'dv-resize-container';
    const button = document.createElement('button');
    pane.append(button);
    document.body.append(elsewhere, pane);
    fireEvent.keyDown(elsewhere, keyEvent('i'));
    fireEvent.keyDown(button, keyEvent('h'));
    fireEvent.keyDown(elsewhere, keyEvent('mod+z'));
    expect(adapter.isolateModelIds).not.toHaveBeenCalled();
    expect(adapter.hideModelIds).not.toHaveBeenCalled();
    expect(adapter.clearModelThemingColors).not.toHaveBeenCalled();
    elsewhere.remove();
    pane.remove();
  });

  it('keeps layout undo in the dock and paint undo in the viewer', () => {
    const adapter = fakeAdapter();
    const layoutUndo = vi.fn();
    renderPalette(adapter);
    COMMANDS.register(DOCK_SOURCE, () => [
      {
        id: 'layout.undo',
        title: 'Undo layout change',
        group: 'Layout',
        keys: ['mod+z'],
        scope: 'dock',
        run: layoutUndo,
      },
    ]);
    const dock = document.createElement('div');
    dock.className = 'bsh-dock';
    const tab = document.createElement('button');
    const pane = document.createElement('div');
    pane.className = 'bsh-viewer-pane';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    pane.append(canvas);
    dock.append(tab, pane);
    document.body.append(dock);

    fireEvent.keyDown(canvas, keyEvent('mod+alt+b'));
    expect(adapter.setModelThemingColor).toHaveBeenCalledOnce();

    fireEvent.keyDown(tab, keyEvent('mod+z'));
    expect(layoutUndo).toHaveBeenCalledOnce();
    expect(adapter.clearModelThemingColors).not.toHaveBeenCalled();

    fireEvent.keyDown(canvas, keyEvent('mod+z'));
    expect(adapter.clearModelThemingColors).toHaveBeenCalledOnce();
    expect(layoutUndo).toHaveBeenCalledOnce();
    dock.remove();
  });

  it('undoes and redoes paint from the viewer context', () => {
    const adapter = fakeAdapter();
    renderPalette(adapter);
    const pane = viewerPane();
    fireEvent.keyDown(pane, keyEvent('mod+alt+b'));
    expect(adapter.setModelThemingColor).toHaveBeenCalledOnce();
    fireEvent.keyDown(pane, keyEvent('mod+z'));
    expect(adapter.clearModelThemingColors).toHaveBeenCalledOnce();
    fireEvent.keyDown(pane, keyEvent('mod+shift+z'));
    expect(adapter.setModelThemingColor).toHaveBeenCalledTimes(2);
    pane.remove();
  });

  it('lists the map in the paint settings', () => {
    render(new PaintTool().renderSettings());
    const section = screen.getByRole('region', { name: 'Viewer shortcuts' });
    expect(section).toHaveTextContent('Isolate selection');
    expect(section).toHaveTextContent('Invert selection');
    expect(section).toHaveTextContent('Undo paint');
  });

  it('paints with the live custom palette', async () => {
    const adapter = fakeAdapter();
    PAINT_SETTINGS.write({
      ...DEFAULT_PAINT_SETTINGS,
      paletteId: 'custom',
      palette: ['#112233'],
      intensity: 0.8,
    });
    const command = viewerCommands(adapter).find(
      (entry) => entry.id === 'viewer.paint',
    );
    await command?.run({ openModal: () => undefined });
    expect(adapter.setModelThemingColor).toHaveBeenCalledWith(
      [{ modelId: 'a', dbId: 1 }],
      hexToRgba('#112233', 0.8),
    );
  });
});
