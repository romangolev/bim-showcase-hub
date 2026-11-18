import type { Command } from './types.js';

export const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

interface ShortcutSpec {
  mod: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

function parse(keys: string): ShortcutSpec | null {
  const parts = keys
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const spec: ShortcutSpec = { mod: false, alt: false, shift: false, key: '' };
  for (const part of parts) {
    if (
      part === 'mod' ||
      part === 'ctrl' ||
      part === 'cmd' ||
      part === 'meta'
    ) {
      spec.mod = true;
    } else if (part === 'alt' || part === 'option') {
      spec.alt = true;
    } else if (part === 'shift') {
      spec.shift = true;
    } else {
      spec.key = part;
    }
  }
  return spec.key ? spec : null;
}

function isMac(): boolean {
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return /Mac|iPhone|iPad/.test(agent);
}

export function formatShortcut(keys: string): string {
  const spec = parse(keys);
  if (!spec) return keys;
  const mac = isMac();
  const parts: string[] = [];
  if (spec.mod) parts.push(mac ? '⌘' : 'Ctrl');
  if (spec.alt) parts.push(mac ? '⌥' : 'Alt');
  if (spec.shift) parts.push(mac ? '⇧' : 'Shift');
  parts.push(spec.key.length === 1 ? spec.key.toUpperCase() : spec.key);
  return mac ? parts.join('') : parts.join('+');
}

export function shortcutMatches(
  keys: string,
  event: Pick<
    KeyboardEvent,
    'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'
  >,
): boolean {
  const spec = parse(keys);
  if (!spec) return false;
  if (spec.mod !== (event.ctrlKey || event.metaKey)) return false;
  if (spec.alt !== event.altKey) return false;
  if (spec.shift !== event.shiftKey) return false;
  return event.key.toLowerCase() === spec.key;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest(EDITABLE_SELECTOR) !== null
  );
}

export function matchShortcut(
  commands: readonly Command[],
  event: Pick<
    KeyboardEvent,
    'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'
  >,
): Command | undefined {
  return commands.find(
    (command) =>
      command.keys?.some((keys) => shortcutMatches(keys, event)) ?? false,
  );
}
