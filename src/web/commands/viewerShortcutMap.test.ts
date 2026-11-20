import { beforeEach, describe, expect, it } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import {
  DEFAULT_VIEWER_SHORTCUTS,
  resetViewerShortcuts,
  setViewerShortcut,
  VIEWER_SHORTCUT_KEYS,
  viewerShortcuts,
} from './viewerShortcutMap.js';

beforeEach(() => {
  installMemoryStorage();
  resetViewerShortcuts();
});

function keysFor(command: string) {
  return viewerShortcuts().find((shortcut) => shortcut.command === command)
    ?.keys;
}

describe('viewer shortcut map', () => {
  it('starts from the default bindings', () => {
    expect(viewerShortcuts()).toEqual(DEFAULT_VIEWER_SHORTCUTS);
  });

  it('rebinds one command and persists it', () => {
    expect(setViewerShortcut('viewer.isolate', 'J')).toBe(true);
    expect(keysFor('viewer.isolate')).toBe('j');
    expect(VIEWER_SHORTCUT_KEYS.read()).toEqual({ 'viewer.isolate': 'j' });
    expect(
      JSON.parse(
        window.localStorage.getItem('bsh.commands.viewer.keys.v1') ?? '{}',
      ),
    ).toEqual({ 'viewer.isolate': 'j' });
  });

  it('resets every binding back to the defaults', () => {
    setViewerShortcut('viewer.hide', 'x');
    resetViewerShortcuts();
    expect(viewerShortcuts()).toEqual(DEFAULT_VIEWER_SHORTCUTS);
    expect(
      window.localStorage.getItem('bsh.commands.viewer.keys.v1'),
    ).toBeNull();
  });

  it('rejects unknown commands, unparsable chords and reserved keys', () => {
    expect(setViewerShortcut('viewer.nope', 'j')).toBe(false);
    expect(setViewerShortcut('viewer.isolate', 'shift+alt')).toBe(false);
    expect(setViewerShortcut('viewer.isolate', 'mod+k')).toBe(false);
    expect(keysFor('viewer.isolate')).toBe('i');
  });

  it('ignores duplicate and reserved overrides from storage', () => {
    VIEWER_SHORTCUT_KEYS.write({
      'viewer.isolate': 'h',
      'viewer.hide': 'mod+k',
    });
    expect(keysFor('viewer.isolate')).toBe('i');
    expect(keysFor('viewer.hide')).toBe('h');
  });
});
