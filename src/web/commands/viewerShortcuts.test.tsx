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
import { VIEWER_SHORTCUTS, viewerCommands } from './viewerCommands.js';

const SOURCE = 'viewer-shortcuts-test';

beforeEach(() => {
  installMemoryStorage();
  COMMANDS.register(SOURCE, () => []);
});

afterEach(() => {
  COMMANDS.register(SOURCE, () => []);
});

function fakeAdapter() {
  const selection = [{ modelId: 'a', dbId: 1 }];
  const visible = [
    { modelId: 'a', dbId: 2 },
    { modelId: 'a', dbId: 3 },
  ];
  return {
    getModels: () => [{ id: 'a', status: 'ready' as const }],
    getModelSelection: () => selection,
    getVisible: async () => visible,
    selectModelIds: vi.fn(),
    isolateModelIds: vi.fn(),
    hideModelIds: vi.fn(),
    showAll: vi.fn(),
    clearSelection: vi.fn(),
    clearThemingColors: vi.fn(),
    setModelThemingColor: vi.fn(),
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

describe('viewer shortcuts', () => {
  it('exposes every binding on its command', () => {
    const commands = viewerCommands(fakeAdapter());
    for (const shortcut of VIEWER_SHORTCUTS) {
      const command = commands.find((entry) => entry.id === shortcut.command);
      expect(command?.keys).toEqual([shortcut.keys]);
    }
  });

  it('keeps bindings unique, modified and clear of the app and layout keys', () => {
    const keys = VIEWER_SHORTCUTS.map((shortcut) => shortcut.keys);
    expect(new Set(keys).size).toBe(keys.length);
    const reserved = ['mod+k', 'mod+alt+t', 'mod+alt+p', 'mod+alt+l'];
    for (const binding of keys) {
      expect(reserved).not.toContain(binding);
      const spec = parseShortcut(binding);
      expect(spec?.mod).toBe(true);
      expect(spec?.alt).toBe(true);
    }
  });

  it('runs the matching command for every binding', async () => {
    const adapter = fakeAdapter();
    renderPalette(adapter);
    for (const { keys } of VIEWER_SHORTCUTS) {
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
    expect(adapter.clearThemingColors).toHaveBeenCalledOnce();
  });

  it('skips editable targets and open dialogs', () => {
    const adapter = fakeAdapter();
    renderPalette(adapter);
    const binding = keyEvent(
      VIEWER_SHORTCUTS.find((shortcut) => shortcut.command === 'viewer.isolate')
        ?.keys ?? '',
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

  it('lists the map in the paint settings', () => {
    render(new PaintTool().renderSettings());
    const section = screen.getByRole('region', { name: 'Viewer shortcuts' });
    expect(section).toHaveTextContent('Isolate selection');
    expect(section).toHaveTextContent('Invert selection');
    expect(section).toHaveTextContent('Reset appearance');
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
