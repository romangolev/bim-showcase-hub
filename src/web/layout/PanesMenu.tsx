import {
  type KeyboardEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { Command } from '../commands/types.js';
import { Hint } from '../components/Hint.js';
import { Icon } from '../components/icons.js';
import type { MenuEntry } from '../components/Menu.js';
import { moveFocus } from '../components/moveFocus.js';
import { onEscape, usePopover } from '../components/usePopover.js';
import { useT } from '../i18n/i18n.js';
import { useModal } from '../modal/index.js';
import { IconButton } from '../ui/IconButton.js';
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
  return (
    <li className="panes-menu__row" role="none" data-kind={pane.id}>
      {primary ? (
        // biome-ignore lint/a11y/useAriaPropsSupportedByRole: the role follows the command kind
        <button
          type="button"
          role={toggle ? 'menuitemcheckbox' : 'menuitem'}
          aria-checked={toggle ? row.open : undefined}
          aria-label={toggle ? pane.title : primary.title}
          aria-describedby={descriptionId}
          className="panes-menu__main"
          disabled={Boolean(primary.disabled)}
          title={
            primary.disabled ??
            (toggle
              ? t(row.open ? 'panes.closePane' : 'panes.openPane', {
                  title: pane.title,
                })
              : primary.title)
          }
          onClick={() => onRun(primary)}
        >
          <Icon name={pane.icon} size={16} className="panes-menu__icon" />
          <span className="panes-menu__text">
            <span className="panes-menu__title">{pane.title}</span>
            <span id={descriptionId} className="panes-menu__description">
              {pane.description}
            </span>
          </span>
          {state ? <span className="panes-menu__state">{state}</span> : null}
        </button>
      ) : (
        <div className="panes-menu__main panes-menu__main--static">
          <Icon name={pane.icon} size={16} className="panes-menu__icon" />
          <span className="panes-menu__text">
            <span className="panes-menu__title">{pane.title}</span>
            <span id={descriptionId} className="panes-menu__description">
              {pane.description}
            </span>
          </span>
        </div>
      )}
      <div className="panes-menu__actions">
        {toggle && row.open ? (
          <button
            type="button"
            role="menuitem"
            className="panes-menu__action"
            aria-label={t('panes.focusPane', { title: pane.title })}
            title={t('panes.focusPane', { title: pane.title })}
            onClick={onFocus}
          >
            <Icon name="locate" size={14} />
          </button>
        ) : null}
        {extras.map((command) => (
          <button
            key={command.id}
            type="button"
            role="menuitem"
            className="panes-menu__action"
            aria-label={command.title}
            title={command.disabled ?? command.title}
            disabled={Boolean(command.disabled)}
            onClick={() => onRun(command)}
          >
            {command.icon ? <Icon name={command.icon} size={14} /> : null}
          </button>
        ))}
      </div>
    </li>
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
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: the role follows the command kind
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={checked}
      className="panes-menu__command"
      disabled={entry.disabled}
      title={entry.description}
      onClick={() => onRun(entry)}
    >
      <span className="panes-menu__command-check">
        {checked ? <Icon name="check" size={14} /> : null}
      </span>
      {entry.icon ? (
        <Icon name={entry.icon} size={14} className="menu-icon" />
      ) : null}
      {entry.label}
    </button>
  );
}

export function PanesMenu() {
  const layout = useLayout();
  const modal = useModal();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

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

  const position = usePopover({
    open,
    triggerRef,
    popoverRef,
    onDismiss: () => setOpen(false),
  });

  useLayoutEffect(() => {
    if (open) {
      popoverRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    }
  }, [open]);

  const run = (command: Command) => {
    close(true);
    void command.run({ openModal: modal.open });
  };

  const runEntry = (entry: MenuEntry) => {
    if (entry.kind === 'separator' || entry.disabled) return;
    close(true);
    entry.onSelect();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (onEscape(event, () => close(true))) return;
    const box = popoverRef.current;
    if (!box) return;
    const buttons = Array.from(
      box.querySelectorAll<HTMLButtonElement>(
        '[role^="menuitem"]:not(:disabled)',
      ),
    );
    if (buttons.length === 0) return;
    const target = event.target as HTMLElement;
    const item = target.closest<HTMLButtonElement>('[role^="menuitem"]');
    const index = item ? buttons.indexOf(item) : -1;
    if (!item && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      buttons[event.key === 'ArrowDown' ? 0 : buttons.length - 1]?.focus();
      return;
    }
    if (item) moveFocus(event, buttons, index);
  };

  return (
    <div className="menu">
      <IconButton
        ref={triggerRef}
        label={t('panes.title')}
        title={t('panes.title')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(event) => {
          if (open) return;
          if (event.key === 'ArrowDown' || event.key === 'Enter') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Icon name="dock" size={18} />
      </IconButton>
      {open
        ? createPortal(
            <div
              ref={popoverRef}
              id={popoverId}
              className="panes-menu__popover"
              role="dialog"
              aria-label={t('panes.title')}
              style={
                position
                  ? { top: position.top, left: position.left }
                  : { top: 0, left: 0, visibility: 'hidden' }
              }
              onKeyDown={onKeyDown}
            >
              <div className="panes-menu__search">
                <Icon name="search" size={14} className="panes-menu__icon" />
                <input
                  type="search"
                  aria-label={t('panes.search')}
                  placeholder={t('panes.search')}
                  autoComplete="off"
                  spellCheck={false}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <Hint id="panes-menu">{t('panes.hint')}</Hint>
              <div
                className="panes-menu__body"
                role="menu"
                aria-label={t('panes.title')}
              >
                <div className="panes-menu__list">
                  {groups.map((group) => (
                    <fieldset
                      key={group.category || 'matches'}
                      className="panes-menu__group"
                      aria-label={group.category || t('panes.matching')}
                    >
                      {group.category ? (
                        <h3 className="panes-menu__heading">
                          {group.category}
                        </h3>
                      ) : null}
                      <ul role="none" className="panes-menu__rows">
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
                      </ul>
                    </fieldset>
                  ))}
                  {groups.length === 0 ? (
                    <p className="panes-menu__empty">{t('panes.empty')}</p>
                  ) : null}
                </div>
                {footer.length > 0 ? (
                  <div className="panes-menu__footer">
                    {footer.map((entry) =>
                      entry.kind === 'separator' ? (
                        <hr key={entry.id} className="panes-menu__separator" />
                      ) : (
                        <FooterEntry
                          key={entry.id}
                          entry={entry}
                          onRun={runEntry}
                        />
                      ),
                    )}
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function LayoutMenu() {
  const layout = useLayout();
  if (layout.mode !== 'dock') return null;
  return <PanesMenu />;
}
