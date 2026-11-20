import { isRecord } from '../../shared/guards.js';
import { BSH_KEYS, defineRecord } from '../storage.js';
import { parseShortcut } from './shortcuts.js';

export interface ViewerShortcut {
  command: string;
  keys: string;
  label: string;
}

export const DEFAULT_VIEWER_SHORTCUTS: readonly ViewerShortcut[] = [
  { command: 'viewer.isolate', keys: 'i', label: 'Isolate selection' },
  { command: 'viewer.hide', keys: 'h', label: 'Hide selection' },
  {
    command: 'viewer.showAll',
    keys: 'shift+h',
    label: 'Show all elements',
  },
  {
    command: 'viewer.invertSelection',
    keys: 'mod+i',
    label: 'Invert selection',
  },
  { command: 'viewer.undoPaint', keys: 'mod+z', label: 'Undo paint' },
  {
    command: 'viewer.redoPaint',
    keys: 'mod+shift+z',
    label: 'Redo paint',
  },
  {
    command: 'viewer.paint',
    keys: 'mod+alt+b',
    label: 'Paint selection with the first swatch',
  },
  {
    command: 'viewer.resetPaint',
    keys: 'mod+alt+shift+r',
    label: 'Reset appearance',
  },
];

export const RESERVED_SHORTCUTS: readonly string[] = [
  'mod+k',
  'mod+alt+t',
  'mod+alt+p',
  'mod+alt+l',
];

const COMMANDS = new Set(DEFAULT_VIEWER_SHORTCUTS.map((it) => it.command));
const RESERVED = new Set(RESERVED_SHORTCUTS);
const MODIFIERS = new Set([
  'mod',
  'ctrl',
  'cmd',
  'meta',
  'alt',
  'option',
  'shift',
]);

export function normalizeShortcut(keys: string): string | null {
  const parts = keys
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  if (new Set(parts).size !== parts.length) return null;
  if (parts.filter((part) => !MODIFIERS.has(part)).length !== 1) return null;
  const normalized = parts.join('+');
  return parseShortcut(normalized) ? normalized : null;
}

export function readViewerShortcutOverrides(
  raw: unknown,
): Record<string, string> {
  const source = isRecord(raw) ? raw : {};
  const effective = new Map(
    DEFAULT_VIEWER_SHORTCUTS.map((shortcut) => [
      shortcut.command,
      shortcut.keys,
    ]),
  );
  const out: Record<string, string> = {};
  for (const shortcut of DEFAULT_VIEWER_SHORTCUTS) {
    const value = source[shortcut.command];
    if (typeof value !== 'string') continue;
    const keys = normalizeShortcut(value);
    if (!keys || RESERVED.has(keys) || keys === shortcut.keys) continue;
    const taken = [...effective.entries()].some(
      ([command, bound]) => command !== shortcut.command && bound === keys,
    );
    if (taken) continue;
    effective.set(shortcut.command, keys);
    out[shortcut.command] = keys;
  }
  return out;
}

export const VIEWER_SHORTCUT_KEYS = defineRecord<Record<string, string>>({
  key: BSH_KEYS.preference.viewerKeys,
  initial: {},
  sanitize: readViewerShortcutOverrides,
});

export function viewerShortcuts(
  overrides: Record<string, string> = VIEWER_SHORTCUT_KEYS.read(),
): ViewerShortcut[] {
  return DEFAULT_VIEWER_SHORTCUTS.map((shortcut) => ({
    ...shortcut,
    keys: overrides[shortcut.command] ?? shortcut.keys,
  }));
}

export function viewerShortcutKeys(command: string): string | undefined {
  return viewerShortcuts().find((shortcut) => shortcut.command === command)
    ?.keys;
}

export function setViewerShortcut(command: string, keys: string): boolean {
  if (!COMMANDS.has(command)) return false;
  const normalized = normalizeShortcut(keys);
  if (!normalized) return false;
  const next = readViewerShortcutOverrides({
    ...VIEWER_SHORTCUT_KEYS.read(),
    [command]: normalized,
  });
  if (!VIEWER_SHORTCUT_KEYS.write(next)) return false;
  return next[command] === normalized;
}

export function resetViewerShortcuts(): void {
  VIEWER_SHORTCUT_KEYS.remove();
}
