import { useState } from 'react';
import { COMMANDS } from '../commands/registry.js';
import { formatShortcut } from '../commands/shortcuts.js';
import { type ShortcutRow, shortcutRows } from './shortcutRows.js';

const FIXED_ROWS: readonly ShortcutRow[] = [
  {
    id: 'fixed.palette',
    title: 'Command palette',
    group: 'Anywhere',
    keys: ['mod+k'],
  },
  {
    id: 'fixed.pane-groups',
    title: 'Next pane group',
    group: 'Anywhere',
    keys: ['f6'],
  },
  {
    id: 'fixed.pane-groups-back',
    title: 'Previous pane group',
    group: 'Anywhere',
    keys: ['shift+f6'],
  },
  {
    id: 'fixed.escape',
    title: 'Restore or leave present',
    group: 'Anywhere',
    keys: ['escape'],
  },
  {
    id: 'fixed.documents-filter',
    title: 'Filter Documents',
    group: 'Documents',
    keys: ['/'],
  },
];

function labelOf(keys: string): string {
  const formatted = formatShortcut(keys);
  return /^f\d+$/i.test(formatted) ? formatted.toUpperCase() : formatted;
}

function grouped(rows: readonly ShortcutRow[]): Array<[string, ShortcutRow[]]> {
  const groups: Array<[string, ShortcutRow[]]> = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (last && last[0] === row.group) last[1].push(row);
    else groups.push([row.group, [row]]);
  }
  return groups;
}

export function ShortcutList() {
  const [rows] = useState(() =>
    [...shortcutRows(COMMANDS.list()), ...FIXED_ROWS].sort(
      (a, b) =>
        a.group.localeCompare(b.group) || a.title.localeCompare(b.title),
    ),
  );
  return (
    <table className="shortcut-list">
      <caption>Keyboard shortcuts</caption>
      <thead>
        <tr>
          <th scope="col">Action</th>
          <th scope="col">Keys</th>
        </tr>
      </thead>
      {grouped(rows).map(([group, entries]) => (
        <tbody key={group}>
          <tr>
            <th scope="rowgroup" colSpan={2}>
              {group}
            </th>
          </tr>
          {entries.map((row) => (
            <tr key={row.id}>
              <th scope="row">{row.title}</th>
              <td>
                {row.keys.map((keys) => (
                  <kbd key={keys}>{labelOf(keys)}</kbd>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}
