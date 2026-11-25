import { COMMANDS } from '../commands/registry.js';
import { formatShortcut } from '../commands/shortcuts.js';
import type { MessageId } from '../i18n/en.js';
import { useT, type Vars } from '../i18n/i18n.js';
import { Kbd } from '../ui/Kbd.js';
import { type ShortcutRow, shortcutRows } from './shortcutRows.js';

const FIXED_ROWS: readonly {
  id: string;
  title: MessageId;
  group: MessageId;
  keys: string[];
}[] = [
  {
    id: 'fixed.palette',
    title: 'help.commandPalette',
    group: 'help.anywhere',
    keys: ['mod+k'],
  },
  {
    id: 'fixed.pane-groups',
    title: 'help.nextPaneGroup',
    group: 'help.anywhere',
    keys: ['f6'],
  },
  {
    id: 'fixed.pane-groups-back',
    title: 'help.previousPaneGroup',
    group: 'help.anywhere',
    keys: ['shift+f6'],
  },
  {
    id: 'fixed.escape',
    title: 'help.restoreOrLeavePresent',
    group: 'help.anywhere',
    keys: ['escape'],
  },
  {
    id: 'fixed.documents-filter',
    title: 'help.filterDocuments',
    group: 'help.groupDocuments',
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

function fixedRows(t: (id: MessageId, vars?: Vars) => string): ShortcutRow[] {
  return FIXED_ROWS.map((row) => ({
    id: row.id,
    title: t(row.title),
    group: t(row.group),
    keys: [...row.keys],
  }));
}

export function ShortcutList() {
  const t = useT();
  const rows = [...shortcutRows(COMMANDS.list()), ...fixedRows(t)].sort(
    (a, b) => a.group.localeCompare(b.group) || a.title.localeCompare(b.title),
  );
  return (
    <table className="shortcut-list">
      <caption>{t('help.shortcuts')}</caption>
      <thead>
        <tr>
          <th scope="col">{t('help.action')}</th>
          <th scope="col">{t('help.keys')}</th>
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
                  <Kbd key={keys}>{labelOf(keys)}</Kbd>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}
