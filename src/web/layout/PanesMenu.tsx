import { useId, useMemo, useRef, useState } from 'react';
import type { Command } from '../commands/types.js';
import { Hint } from '../components/Hint.js';
import { Icon } from '../components/icons.js';
import type { MenuEntry } from '../components/Menu.js';
import { useT } from '../i18n/i18n.js';
import { useModal } from '../modal/index.js';
import { IconButton } from '../ui/IconButton.js';
import {
  MenuCheckboxItem,
  MenuFilterProvider,
  MenuGroup,
  MenuGroupLabel,
  MenuInput,
  MenuItem,
  MenuItemIndicator,
  MenuList,
  MenuPopup,
  Menu as MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from '../ui/Menu.js';
import { layoutCommands, paneCommandContext } from './layoutCommandList.js';
import { type LayoutApi, useLayout } from './layoutContext.js';
import { layoutMenuEntries } from './PaneMenu.js';
import { PANES, type PaneDefinition, paneCommandsFor } from './paneRegistry.js';

function matchesPane(pane: PaneDefinition, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text =
    `${pane.title} ${pane.description} ${pane.category} ${pane.keywords}`.toLowerCase();
  return terms.every((term) => text.includes(term));
}

function groupPanes(
  panes: readonly PaneDefinition[],
  query: string,
): { category: string; panes: PaneDefinition[] }[] {
  const matched = panes.filter((pane) => matchesPane(pane, query));
  if (query.trim()) {
    return matched.length > 0 ? [{ category: '', panes: matched }] : [];
  }
  const groups = new Map<string, PaneDefinition[]>();
  for (const pane of matched) {
    groups.set(pane.category, [...(groups.get(pane.category) ?? []), pane]);
  }
  return [...groups].map(([category, grouped]) => ({
    category,
    panes: grouped,
  }));
}

interface PaneRow {
  pane: PaneDefinition;
  open: boolean;
  toggle: Command | null;
  create: Command | null;
  extras: Command[];
}

function rowsOf(layout: LayoutApi): PaneRow[] {
  const ctx = paneCommandContext(layout);
  return PANES.flatMap((pane) => {
    const commands = paneCommandsFor(pane, ctx);
    const toggle = commands.find((command) => command.menu === 'toggle');
    const create = commands.find((command) => command.menu === 'create');
    const extras = commands.filter(
      (command) => command.menu !== 'toggle' && command.menu !== 'create',
    );
    if (!toggle && !create && extras.length === 0) return [];
    return [
      {
        pane,
        open: layout.isOpen(pane.id),
        toggle: toggle ?? null,
        create: create ?? null,
        extras,
      },
    ];
  });
}

function isPaneEntry(entry: MenuEntry): boolean {
  return entry.kind !== 'separator' && entry.id.startsWith('pane.');
}

function withoutPaneEntries(entries: readonly MenuEntry[]): MenuEntry[] {
  const clean: MenuEntry[] = [];
  for (const entry of entries) {
    if (isPaneEntry(entry)) continue;
    if (
      entry.kind === 'separator' &&
      (clean.length === 0 || clean[clean.length - 1]?.kind === 'separator')
    )
      continue;
    clean.push(entry);
  }
  return clean;
}

interface RowProps {
  row: PaneRow;
  onRun: (command: Command) => void;
  onFocus: () => void;
}

function PaneRowItem({ row, onRun, onFocus }: RowProps) {
  const { pane, toggle, create, extras } = row;
  const descriptionId = useId();
  const t = useT();
  const primary = toggle ?? create;
  const state = toggle
    ? row.open
      ? t('panes.open')
      : t('panes.closed')
    : create
      ? t('panes.new')
      : null;
  const label = toggle ? pane.title : (primary?.title ?? pane.title);
  const description = primary?.disabled
    ? primary.disabled
    : toggle
      ? t(row.open ? 'panes.closePane' : 'panes.openPane', {
          title: pane.title,
        })
      : primary?.title;
  const content = (
    <>
      <Icon name={pane.icon} size={16} className="panes-menu__icon" />
      <span className="panes-menu__text">
        <span className="panes-menu__title">{pane.title}</span>
        <span id={descriptionId} className="panes-menu__description">
          {pane.description}
        </span>
      </span>
      {state ? <span className="panes-menu__state">{state}</span> : null}
    </>
  );
  return (
    <div className="panes-menu__row" role="none" data-kind={pane.id}>
      {primary ? (
        toggle ? (
          <MenuCheckboxItem
            checked={row.open}
            aria-label={label}
            aria-describedby={descriptionId}
            className="panes-menu__main"
            disabled={Boolean(primary.disabled)}
            title={description}
            onClick={() => onRun(primary)}
          >
            {content}
          </MenuCheckboxItem>
        ) : (
          <MenuItem
            aria-label={label}
            aria-describedby={descriptionId}
            className="panes-menu__main"
            disabled={Boolean(primary.disabled)}
            title={description}
            onClick={() => onRun(primary)}
          >
            {content}
          </MenuItem>
        )
      ) : (
        <div className="panes-menu__main panes-menu__main--static">
          {content}
        </div>
      )}
      <div className="panes-menu__actions">
        {toggle && row.open ? (
          <MenuItem
            className="panes-menu__action"
            aria-label={t('panes.focusPane', { title: pane.title })}
            title={t('panes.focusPane', { title: pane.title })}
            onClick={onFocus}
          >
            <Icon name="locate" size={14} />
          </MenuItem>
        ) : null}
        {extras.map((command) => (
          <MenuItem
            key={command.id}
            className="panes-menu__action"
            aria-label={command.title}
            title={command.disabled ?? command.title}
            disabled={Boolean(command.disabled)}
            onClick={() => onRun(command)}
          >
            {command.icon ? <Icon name={command.icon} size={14} /> : null}
          </MenuItem>
        ))}
      </div>
    </div>
  );
}

function FooterEntry({
  entry,
  onRun,
}: {
  entry: Exclude<MenuEntry, { kind: 'separator' }>;
  onRun: (entry: MenuEntry) => void;
}) {
  const checked = entry.checked;
  const content = (
    <>
      <MenuItemIndicator>
        {checked ? <Icon name="check" size={14} /> : null}
      </MenuItemIndicator>
      {entry.icon ? (
        <Icon name={entry.icon} size={14} className="menu-icon" />
      ) : null}
      {entry.label}
    </>
  );
  const shared = {
    title: entry.description,
    disabled: Boolean(entry.disabled),
    onClick: () => onRun(entry),
  };
  return checked === undefined ? (
    <MenuItem {...shared}>{content}</MenuItem>
  ) : (
    <MenuCheckboxItem {...shared} checked={checked}>
      {content}
    </MenuCheckboxItem>
  );
}

export function PanesMenu() {
  const layout = useLayout();
  const modal = useModal();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);

  const rows = useMemo(() => rowsOf(layout), [layout]);
  const visiblePanes = useMemo(() => rows.map((row) => row.pane), [rows]);
  const groups = useMemo(
    () => groupPanes(visiblePanes, query),
    [visiblePanes, query],
  );
  const rowById = useMemo(
    () => new Map(rows.map((row) => [row.pane.id, row])),
    [rows],
  );
  const commands = useMemo(() => layoutCommands(layout), [layout]);
  const footer = useMemo(
    () =>
      withoutPaneEntries(
        layoutMenuEntries(layout, { openModal: modal.open }, commands),
      ),
    [layout, modal.open, commands],
  );

  const close = (restore: boolean) => {
    setOpen(false);
    if (restore) triggerRef.current?.focus();
  };

  const run = (command: Command) => {
    close(true);
    void command.run({ openModal: modal.open });
  };

  const runEntry = (entry: MenuEntry) => {
    if (entry.kind === 'separator' || entry.disabled) return;
    close(true);
    entry.onSelect();
  };

  return (
    <MenuFilterProvider filter={null} value={query} onValueChange={setQuery}>
      <MenuRoot
        open={open}
        modal={false}
        onOpenChange={(next, details) =>
          next ? setOpen(true) : close(details.reason === 'escape-key')
        }
      >
        <MenuTrigger
          ref={triggerRef}
          render={<IconButton label={t('panes.title')} tooltip />}
        >
          <Icon name="dock" size={18} />
        </MenuTrigger>
        <MenuPopup
          className="panes-menu__popover"
          aria-label={t('panes.title')}
          finalFocus={false}
          align="end"
        >
          <div className="panes-menu__search">
            <Icon name="search" size={14} className="panes-menu__icon" />
            <MenuInput
              aria-label={t('panes.search')}
              placeholder={t('panes.search')}
            />
          </div>
          <Hint id="panes-menu">{t('panes.hint')}</Hint>
          <MenuList className="panes-menu__body" aria-label={t('panes.title')}>
            {groups.map((group) => (
              <MenuGroup
                key={group.category || 'matches'}
                className="panes-menu__group"
                aria-label={group.category || t('panes.matching')}
              >
                {group.category ? (
                  <MenuGroupLabel className="panes-menu__heading">
                    {group.category}
                  </MenuGroupLabel>
                ) : null}
                {group.panes.map((pane) => {
                  const row = rowById.get(pane.id);
                  if (!row) return null;
                  return (
                    <PaneRowItem
                      key={pane.id}
                      row={row}
                      onRun={run}
                      onFocus={() => {
                        close(true);
                        layout.focusPane(pane.id);
                      }}
                    />
                  );
                })}
              </MenuGroup>
            ))}
            {groups.length === 0 ? (
              <p className="panes-menu__empty">{t('panes.empty')}</p>
            ) : null}
          </MenuList>
          {footer.length > 0 ? (
            <div className="panes-menu__footer">
              {footer.map((entry) =>
                entry.kind === 'separator' ? (
                  <MenuSeparator key={entry.id} />
                ) : (
                  <FooterEntry key={entry.id} entry={entry} onRun={runEntry} />
                ),
              )}
            </div>
          ) : null}
        </MenuPopup>
      </MenuRoot>
    </MenuFilterProvider>
  );
}

export function LayoutMenu() {
  const layout = useLayout();
  if (layout.mode !== 'dock') return null;
  return <PanesMenu />;
}
