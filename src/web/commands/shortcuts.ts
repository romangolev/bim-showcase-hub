import type { Command, CommandScope } from './types.js';

export const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

export interface ShortcutSpec {
  mod: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

export type ShortcutEvent = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'
> & { code?: string };

export function parseShortcut(keys: string): ShortcutSpec | null {
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
  const spec = parseShortcut(keys);
  if (!spec) return keys;
  const mac = isMac();
  const parts: string[] = [];
  if (spec.mod) parts.push(mac ? '⌘' : 'Ctrl');
  if (spec.alt) parts.push(mac ? '⌥' : 'Alt');
  if (spec.shift) parts.push(mac ? '⇧' : 'Shift');
  parts.push(spec.key.length === 1 ? spec.key.toUpperCase() : spec.key);
  return mac ? parts.join('') : parts.join('+');
}

function keyOfCode(spec: ShortcutSpec, code: string): boolean {
  if (!/^[a-z0-9]$/.test(spec.key)) return false;
  const letter = `Key${spec.key.toUpperCase()}`;
  return code === letter || code === `Digit${spec.key}`;
}

export function shortcutMatches(keys: string, event: ShortcutEvent): boolean {
  const spec = parseShortcut(keys);
  if (!spec) return false;
  if (spec.mod !== (event.ctrlKey || event.metaKey)) return false;
  if (spec.alt !== event.altKey) return false;
  if (spec.shift !== event.shiftKey) return false;
  if (event.key.toLowerCase() === spec.key) return true;
  return event.code !== undefined && keyOfCode(spec, event.code);
}

export function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest(EDITABLE_SELECTOR) !== null
  );
}

export const VIEWER_CONTEXT_SELECTOR = '.bsh-viewer-pane, .pane-model';
export const FLOATING_PANE_SELECTOR = '.dv-resize-container';

export function isViewerContext(target: EventTarget | null): boolean {
  if (target === null || target instanceof Document) return true;
  if (!(target instanceof Element)) return false;
  if (target.closest(FLOATING_PANE_SELECTOR)) return false;
  if (isEditableTarget(target)) return false;
  if (target.closest(VIEWER_CONTEXT_SELECTOR)) return true;
  return target === document.body || target === document.documentElement;
}

export const DOCK_CONTEXT_SELECTOR = '.bsh-dock';

export function isDockContext(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (isEditableTarget(target)) return false;
  if (target.closest(VIEWER_CONTEXT_SELECTOR)) return false;
  return target.closest(DOCK_CONTEXT_SELECTOR) !== null;
}

export function scopeAllows(
  scope: CommandScope | undefined,
  target: EventTarget | null,
): boolean {
  if (scope === 'viewer') return isViewerContext(target);
  if (scope === 'dock') return isDockContext(target);
  return true;
}

export function matchShortcut(
  commands: readonly Command[],
  event: ShortcutEvent,
): Command | undefined {
  return commands.find(
    (command) =>
      command.keys?.some((keys) => shortcutMatches(keys, event)) ?? false,
  );
}
