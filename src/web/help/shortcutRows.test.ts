import { describe, expect, it } from 'vitest';
import type { Command } from '../commands/types.js';
import { shortcutRows } from './shortcutRows.js';

const run = () => undefined;

describe('shortcutRows', () => {
  it('lists only commands with keys, grouped and sorted by group then title', () => {
    const commands: Command[] = [
      {
        id: 'b',
        title: 'Lock layout',
        group: 'Layout',
        keys: ['mod+alt+l'],
        run,
      },
      { id: 'a', title: 'Present', group: 'Layout', keys: ['mod+alt+p'], run },
      { id: 'c', title: 'Open settings', group: 'Settings', run },
      { id: 'd', title: 'Isolate', group: 'Viewer', keys: ['i'], run },
    ];
    expect(shortcutRows(commands).map((row) => row.id)).toEqual([
      'b',
      'a',
      'd',
    ]);
  });

  it('keeps every chord of a command', () => {
    const rows = shortcutRows([
      {
        id: 'r',
        title: 'Redo',
        group: 'Layout',
        keys: ['mod+shift+z', 'mod+y'],
        run,
      },
    ]);
    expect(rows[0]?.keys).toEqual(['mod+shift+z', 'mod+y']);
  });
});
