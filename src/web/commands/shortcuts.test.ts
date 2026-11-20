import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatShortcut,
  isEditableTarget,
  isMacPlatform,
  matchShortcut,
  parseShortcut,
  shortcutFromEvent,
  shortcutMatches,
} from './shortcuts.js';
import type { Command } from './types.js';

function agent(userAgent: string) {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: userAgent,
  });
}

afterEach(() => {
  agent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
  vi.restoreAllMocks();
});

const mac = {
  key: 't',
  ctrlKey: false,
  metaKey: true,
  altKey: true,
  shiftKey: false,
};

describe('parseShortcut', () => {
  it('reads modifiers and one key in any case and order', () => {
    expect(parseShortcut('Mod+Alt+T')).toEqual({
      mod: true,
      alt: true,
      shift: false,
      key: 't',
    });
    expect(parseShortcut('shift + cmd + k')).toEqual({
      mod: true,
      alt: false,
      shift: true,
      key: 'k',
    });
  });

  it('rejects empty and modifier-only chords', () => {
    expect(parseShortcut('')).toBeNull();
    expect(parseShortcut('shift+alt')).toBeNull();
  });
});

describe('formatShortcut', () => {
  it('uses mac symbols on a mac and words elsewhere', () => {
    agent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    expect(formatShortcut('mod+alt+t')).toBe('⌘⌥T');
    expect(formatShortcut('shift+mod+k')).toBe('⌘⇧K');
    agent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    expect(formatShortcut('mod+alt+t')).toBe('Ctrl+Alt+T');
  });

  it('leaves an unparsable chord as written', () => {
    expect(formatShortcut('')).toBe('');
  });
});

describe('shortcutMatches', () => {
  it('treats Ctrl and Cmd as the same mod', () => {
    expect(shortcutMatches('mod+alt+t', mac)).toBe(true);
    expect(
      shortcutMatches('mod+alt+t', { ...mac, metaKey: false, ctrlKey: true }),
    ).toBe(true);
  });

  it('requires alt and shift exactly', () => {
    expect(shortcutMatches('mod+t', mac)).toBe(false);
    expect(shortcutMatches('mod+alt+shift+t', mac)).toBe(false);
    expect(shortcutMatches('mod+alt+t', { ...mac, altKey: false })).toBe(false);
  });

  it('matches by key code when Option changes the character', () => {
    expect(
      shortcutMatches('mod+alt+t', {
        ...mac,
        key: '†',
        code: 'KeyT',
      }),
    ).toBe(true);
    expect(
      shortcutMatches('mod+alt+p', { ...mac, key: 'π', code: 'KeyP' }),
    ).toBe(true);
    expect(
      shortcutMatches('mod+alt+l', { ...mac, key: '¬', code: 'KeyL' }),
    ).toBe(true);
    expect(
      shortcutMatches('mod+alt+t', { ...mac, key: '†', code: 'KeyP' }),
    ).toBe(false);
  });

  it('does not match a bare key without the modifiers', () => {
    expect(
      shortcutMatches('mod+alt+t', {
        key: 't',
        code: 'KeyT',
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      }),
    ).toBe(false);
  });
});

describe('shortcutFromEvent', () => {
  it('builds a normalized chord and ignores bare modifiers', () => {
    agent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    expect(
      shortcutFromEvent({
        key: 'I',
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: true,
      }),
    ).toBe('ctrl+shift+i');
    agent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    expect(
      shortcutFromEvent({
        key: 'I',
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: true,
      }),
    ).toBe('mod+shift+i');
    expect(
      shortcutFromEvent({
        key: 'Shift',
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: true,
      }),
    ).toBeNull();
    expect(
      shortcutFromEvent({
        key: 'h',
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      }),
    ).toBe('h');
  });

  it('reads an Option chord from the key code on a mac', () => {
    agent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    expect(
      shortcutFromEvent({
        key: '∫',
        code: 'KeyB',
        ctrlKey: false,
        metaKey: true,
        altKey: true,
        shiftKey: false,
      }),
    ).toBe('mod+alt+b');
  });
});

describe('isMacPlatform', () => {
  it('follows the user agent', () => {
    agent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    expect(isMacPlatform()).toBe(true);
    agent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    expect(isMacPlatform()).toBe(false);
  });
});

describe('isEditableTarget', () => {
  it('recognises text fields and contenteditable hosts', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(isEditableTarget(document.createElement(tag))).toBe(true);
    }
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    expect(isEditableTarget(editor)).toBe(true);
    const staticEditor = document.createElement('div');
    staticEditor.setAttribute('contenteditable', 'false');
    expect(isEditableTarget(staticEditor)).toBe(false);
  });

  it('ignores buttons, plain elements and null', () => {
    expect(isEditableTarget(document.createElement('button'))).toBe(false);
    expect(isEditableTarget(document.createElement('div'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('matchShortcut', () => {
  it('returns the command whose keys match', () => {
    const commands: Command[] = [
      { id: 'a', title: 'A', group: 'G', keys: ['mod+k'], run: () => {} },
      { id: 'b', title: 'B', group: 'G', keys: ['mod+alt+t'], run: () => {} },
    ];
    expect(matchShortcut(commands, mac)?.id).toBe('b');
    expect(
      matchShortcut(commands, {
        ...mac,
        metaKey: false,
        ctrlKey: true,
        altKey: false,
        key: 'k',
      })?.id,
    ).toBe('a');
    expect(
      matchShortcut(commands, { ...mac, code: undefined, key: 'x' }),
    ).toBeUndefined();
  });
});
