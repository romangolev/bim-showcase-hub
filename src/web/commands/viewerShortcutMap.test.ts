import { beforeEach, describe, expect, it } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import {
  checkViewerShortcut,
  DEFAULT_VIEWER_SHORTCUTS,
  resetViewerShortcut,
  resetViewerShortcuts,
  setViewerShortcut,
  VIEWER_SHORTCUT_KEYS,
  viewerShortcutKeys,
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

describe('checkViewerShortcut', () => {
  it('accepts a free chord and names the owner of a taken one', () => {
    expect(checkViewerShortcut('viewer.isolate', 'mod+shift+i')).toEqual({
      ok: true,
      keys: 'mod+shift+i',
    });
    expect(checkViewerShortcut('viewer.isolate', 'h')).toEqual({
      ok: false,
      reason: 'taken',
      by: 'Hide selection',
    });
  });

  it('refuses reserved, unparsable and unknown entries', () => {
    expect(checkViewerShortcut('viewer.isolate', 'mod+k')).toEqual({
      ok: false,
      reason: 'reserved',
    });
    expect(checkViewerShortcut('viewer.isolate', 'mod+')).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(checkViewerShortcut('nope', 'x')).toEqual({
      ok: false,
      reason: 'unknown',
    });
  });

  it('resets one binding and keeps the others', () => {
    setViewerShortcut('viewer.isolate', 'mod+shift+i');
    setViewerShortcut('viewer.hide', 'mod+shift+h');
    resetViewerShortcut('viewer.isolate');
    expect(viewerShortcutKeys('viewer.isolate')).toBe('i');
    expect(viewerShortcutKeys('viewer.hide')).toBe('mod+shift+h');
  });

  it('lets a command keep its own chord', () => {
    expect(checkViewerShortcut('viewer.isolate', 'i')).toEqual({
      ok: true,
      keys: 'i',
    });
  });
});
