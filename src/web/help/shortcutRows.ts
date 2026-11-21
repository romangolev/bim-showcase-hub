import type { Command } from '../commands/types.js';

export interface ShortcutRow {
  id: string;
  title: string;
  group: string;
  keys: string[];
}

export function shortcutRows(commands: readonly Command[]): ShortcutRow[] {
  return commands
    .filter((command) => (command.keys?.length ?? 0) > 0)
    .map((command) => ({
      id: command.id,
      title: command.title,
      group: command.group,
      keys: [...(command.keys ?? [])],
    }))
    .sort(
      (a, b) =>
        a.group.localeCompare(b.group) || a.title.localeCompare(b.title),
    );
}
