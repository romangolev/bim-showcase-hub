import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { Command } from '../commands/types.js';
import { Icon } from '../components/icons.js';
import type { MenuEntry } from '../components/Menu.js';
import { useModal } from '../modal/index.js';
import { layoutCommands, paneCommandContext } from './layoutCommandList.js';
import { type LayoutApi, useLayout } from './layoutContext.js';
import { layoutMenuEntries } from './PaneMenu.js';
import {
  orderPanes,
  type PaneCatalog,
  usePaneCatalog,
  withHidden,
  withPin,
} from './paneCatalog.js';
import { PANES, type PaneDefinition, paneCommandsFor } from './paneRegistry.js';

const GAP = 4;

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

interface PinProps {
  pane: PaneDefinition;
  pinned: boolean;
  onToggle: () => void;
}

function PinAction({ pane, pinned, onToggle }: PinProps) {
  const label = `${pinned ? 'Unpin' : 'Pin'} ${pane.title}`;
  return (
    <button
      type="button"
      className="panes-menu__action"
      aria-label={label}
      title={label}
      aria-pressed={pinned}
      onClick={onToggle}
    >
      <Icon name="star" size={14} />
    </button>
  );
}

interface RowProps {
  row: PaneRow;
  pinned: boolean;
  hidden: boolean;
  onRun: (command: Command) => void;
  onPin: () => void;
  onHide: () => void;
  onFocus: () => void;
}

function PaneRowItem({
  row,
  pinned,
  hidden,
  onRun,
  onPin,
  onHide,
  onFocus,
}: RowProps) {
  const { pane, toggle, create, extras } = row;
  const descriptionId = useId();
  const primary = toggle ?? create;
  const state = toggle ? (row.open ? 'Open' : 'Closed') : create ? 'New' : null;
  return (
    <li className="panes-menu__row" data-kind={pane.id} data-hidden={hidden}>
      {primary && !hidden ? (
        <button
          type="button"
          aria-pressed={toggle ? row.open : undefined}
          aria-label={pane.title}
          aria-describedby={descriptionId}
          className="panes-menu__main"
          disabled={Boolean(primary.disabled)}
          title={
            primary.disabled ??
            (toggle
              ? `${row.open ? 'Close' : 'Open'} ${pane.title}`
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
        {!hidden && toggle && row.open ? (
          <button
            type="button"
            className="panes-menu__action"
            aria-label={`Focus ${pane.title}`}
            title={`Focus ${pane.title}`}
            onClick={onFocus}
          >
            <Icon name="locate" size={14} />
          </button>
        ) : null}
        {!hidden
          ? extras.map((command) => (
              <button
                key={command.id}
                type="button"
                className="panes-menu__action"
                aria-label={command.title}
                title={command.disabled ?? command.title}
                disabled={Boolean(command.disabled)}
                onClick={() => onRun(command)}
              >
                {command.icon ? <Icon name={command.icon} size={14} /> : null}
              </button>
            ))
          : null}
        {!hidden ? (
          <PinAction pane={pane} pinned={pinned} onToggle={onPin} />
        ) : null}
        <button
          type="button"
          className="panes-menu__action"
          aria-label={hidden ? `Show ${pane.title}` : `Hide ${pane.title}`}
          title={hidden ? `Show ${pane.title}` : `Hide ${pane.title}`}
          onClick={onHide}
        >
          <Icon name={hidden ? 'check' : 'ban'} size={14} />
        </button>
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
    <button
      type="button"
      aria-pressed={checked === undefined ? undefined : checked}
      className="menu__item"
      disabled={entry.disabled}
      title={entry.description}
      onClick={() => onRun(entry)}
    >
      <span className="menu__check">
        {checked ? <Icon name="check" size={14} /> : null}
      </span>
      {entry.icon ? (
        <Icon name={entry.icon} size={14} className="menu__icon" />
      ) : null}
      {entry.label}
    </button>
  );
}

export function PanesMenu() {
  const layout = useLayout();
  const modal = useModal();
  const [catalog, setCatalog] = usePaneCatalog();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  const rows = useMemo(() => rowsOf(layout), [layout]);
  const visiblePanes = useMemo(() => rows.map((row) => row.pane), [rows]);
  const ordered = useMemo(
    () => orderPanes(visiblePanes, catalog, query, showHidden),
    [visiblePanes, catalog, query, showHidden],
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

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    const box = popoverRef.current;
    if (!rect || !box) return;
    const width = box.offsetWidth;
    const height = box.offsetHeight;
    const left = Math.max(
      GAP,
      Math.min(rect.right - width, window.innerWidth - width - GAP),
    );
    const below = rect.bottom + GAP;
    const top =
      below + height > window.innerHeight
        ? Math.max(GAP, rect.top - height - GAP)
        : below;
    setPosition({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    place();
    popoverRef.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !popoverRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

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

  const toggleCatalog = (next: PaneCatalog) => {
    setCatalog(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    const box = popoverRef.current;
    if (!box) return;
    const buttons = Array.from(
      box.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
    );
    if (buttons.length === 0) return;
    const target = event.target as HTMLElement;
    const isButton = target.tagName === 'BUTTON';
    const index = buttons.indexOf(target as HTMLButtonElement);
    const focusAt = (next: number) => {
      event.preventDefault();
      buttons[(next + buttons.length) % buttons.length]?.focus();
    };
    if (!isButton && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      focusAt(event.key === 'ArrowDown' ? 0 : buttons.length - 1);
      return;
    }
    if (!isButton) return;
    if (event.key === 'ArrowDown') focusAt(index + 1);
    else if (event.key === 'ArrowUp') focusAt(index - 1);
    else if (event.key === 'Home') focusAt(0);
    else if (event.key === 'End') focusAt(buttons.length - 1);
  };

  const hiddenCount = catalog.hidden.filter((id) =>
    rows.some((row) => row.pane.id === id),
  ).length;

  return (
    <div className="menu">
      <button
        ref={triggerRef}
        type="button"
        className="icon-button"
        aria-label="Panes"
        title="Panes"
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
      </button>
      {open
        ? createPortal(
            <div
              ref={popoverRef}
              id={popoverId}
              className="panes-menu__popover"
              role="dialog"
              aria-label="Panes"
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
                  aria-label="Search panes"
                  placeholder="Search panes"
                  autoComplete="off"
                  spellCheck={false}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div className="panes-menu__list">
                {ordered.pinned.length > 0 ? (
                  <section aria-label="Pinned panes">
                    <h3 className="panes-menu__heading">Pinned</h3>
                    <ul className="panes-menu__rows">
                      {ordered.pinned.map((pane) => {
                        const row = rowById.get(pane.id);
                        if (!row) return null;
                        return (
                          <PaneRowItem
                            key={pane.id}
                            row={row}
                            pinned
                            hidden={false}
                            onRun={run}
                            onPin={() =>
                              toggleCatalog(withPin(catalog, pane.id))
                            }
                            onHide={() =>
                              toggleCatalog(withHidden(catalog, pane.id))
                            }
                            onFocus={() => {
                              close(true);
                              layout.focusPane(pane.id);
                            }}
                          />
                        );
                      })}
                    </ul>
                  </section>
                ) : null}
                {ordered.groups.map((group) => (
                  <section
                    key={group.category || 'matches'}
                    aria-label={group.category || 'Matching panes'}
                  >
                    {group.category ? (
                      <h3 className="panes-menu__heading">{group.category}</h3>
                    ) : null}
                    <ul className="panes-menu__rows">
                      {group.panes.map((pane) => {
                        const row = rowById.get(pane.id);
                        if (!row) return null;
                        return (
                          <PaneRowItem
                            key={pane.id}
                            row={row}
                            pinned={catalog.pins.includes(pane.id)}
                            hidden={false}
                            onRun={run}
                            onPin={() =>
                              toggleCatalog(withPin(catalog, pane.id))
                            }
                            onHide={() =>
                              toggleCatalog(withHidden(catalog, pane.id))
                            }
                            onFocus={() => {
                              close(true);
                              layout.focusPane(pane.id);
                            }}
                          />
                        );
                      })}
                    </ul>
                  </section>
                ))}
                {ordered.groups.length === 0 &&
                ordered.pinned.length === 0 &&
                ordered.hidden.length === 0 ? (
                  <p className="panes-menu__empty">No panes match</p>
                ) : null}
                {ordered.hidden.length > 0 ? (
                  <section aria-label="Hidden panes">
                    <h3 className="panes-menu__heading">Hidden</h3>
                    <ul className="panes-menu__rows">
                      {ordered.hidden.map((pane) => {
                        const row = rowById.get(pane.id);
                        if (!row) return null;
                        return (
                          <PaneRowItem
                            key={pane.id}
                            row={row}
                            pinned={false}
                            hidden
                            onRun={run}
                            onPin={() =>
                              toggleCatalog(withPin(catalog, pane.id))
                            }
                            onHide={() =>
                              toggleCatalog(withHidden(catalog, pane.id))
                            }
                            onFocus={() => undefined}
                          />
                        );
                      })}
                    </ul>
                  </section>
                ) : null}
              </div>
              {hiddenCount > 0 || showHidden ? (
                <button
                  type="button"
                  className="panes-menu__manage"
                  aria-pressed={showHidden}
                  onClick={() => setShowHidden((value) => !value)}
                >
                  {showHidden
                    ? 'Hide hidden panes'
                    : `Show hidden panes (${hiddenCount})`}
                </button>
              ) : null}
              {footer.length > 0 ? (
                <div className="panes-menu__footer">
                  {footer.map((entry) =>
                    entry.kind === 'separator' ? (
                      <hr key={entry.id} className="menu__separator" />
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
