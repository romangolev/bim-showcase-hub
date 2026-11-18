import {
  Fragment,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { useModal } from '../modal/index.js';
import { filterCommands } from './fuzzy.js';
import { readRecents, recordRecent } from './recents.js';
import { COMMANDS } from './registry.js';
import type { Command } from './types.js';

export const RECENT_GROUP = 'Recent';

export function arrange(
  commands: readonly Command[],
  query: string,
  recents: readonly string[],
): Array<{ command: Command; group: string }> {
  if (query.trim()) {
    return filterCommands(commands, query).map((command) => ({
      command,
      group: command.group,
    }));
  }
  const byId = new Map(commands.map((command) => [command.id, command]));
  const recent = recents
    .map((id) => byId.get(id))
    .filter((command): command is Command => command !== undefined);
  const recentIds = new Set(recent.map((command) => command.id));
  return [
    ...recent.map((command) => ({ command, group: RECENT_GROUP })),
    ...commands
      .filter((command) => !recentIds.has(command.id))
      .map((command) => ({ command, group: command.group })),
  ];
}

interface DialogProps {
  onClose: () => void;
  onRun: (command: Command) => void;
}

function PaletteDialog({ onClose, onRun }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  const [commands] = useState(() => COMMANDS.list());
  const [recents] = useState(readRecents);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const items = useMemo(
    () => arrange(commands, query, recents),
    [commands, query, recents],
  );
  const current = Math.min(active, Math.max(items.length - 1, 0));
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const onNativeClose = () => onCloseRef.current();
    dialog?.addEventListener('close', onNativeClose);
    if (dialog && !dialog.open) dialog.showModal();
    dialog?.querySelector('input')?.focus();
    return () => {
      dialog?.removeEventListener('close', onNativeClose);
      opener?.focus();
    };
  }, [opener]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[id="${optionId(current)}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  });

  const onKeyDown = (event: KeyboardEvent) => {
    const last = items.length - 1;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(current >= last ? 0 : current + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(current <= 0 ? last : current - 1);
    } else if (event.key === 'Enter') {
      if (event.nativeEvent.isComposing) return;
      event.preventDefault();
      const entry = items[current];
      if (entry && !entry.command.disabled) onRun(entry.command);
    }
  };

  let previous = '';
  return (
    <dialog
      ref={dialogRef}
      className="cmdk"
      aria-label="Command palette"
      onMouseDown={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="cmdk__panel">
        <input
          className="cmdk__input"
          type="text"
          role="combobox"
          aria-label="Search commands"
          aria-expanded="true"
          aria-controls={`${baseId}-list`}
          aria-autocomplete="list"
          aria-activedescendant={items.length ? optionId(current) : undefined}
          placeholder="Type a command"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <div
          ref={listRef}
          id={`${baseId}-list`}
          className="cmdk__list"
          role="listbox"
          aria-label="Commands"
        >
          {items.map(({ command, group }, index) => {
            const heading = group !== previous;
            previous = group;
            return (
              <Fragment key={`${group}:${command.id}`}>
                {heading ? (
                  <div className="cmdk__group" role="presentation">
                    {group}
                  </div>
                ) : null}
                <div
                  id={optionId(index)}
                  role="option"
                  tabIndex={-1}
                  aria-selected={index === current}
                  aria-disabled={command.disabled ? true : undefined}
                  className="cmdk__option"
                  data-active={index === current}
                  onMouseMove={() => setActive(index)}
                  onClick={() => {
                    if (!command.disabled) onRun(command);
                  }}
                  onKeyDown={onKeyDown}
                >
                  <span className="cmdk__title">{command.title}</span>
                  {command.disabled ? (
                    <span className="cmdk__reason">{command.disabled}</span>
                  ) : null}
                </div>
              </Fragment>
            );
          })}
        </div>
        {items.length === 0 ? (
          <p className="cmdk__empty">No matching commands</p>
        ) : null}
        <div className="visually-hidden" role="status">
          {items.length === 1 ? '1 command' : `${items.length} commands`}
        </div>
      </div>
    </dialog>
  );
}

export function isPaletteShortcut(event: globalThis.KeyboardEvent): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'k'
  );
}

const EDITABLE =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

function typingOutsidePalette(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(EDITABLE) !== null &&
    target.closest('.cmdk') === null
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const modal = useModal();

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (!isPaletteShortcut(event) || event.isComposing) return;
      if (typingOutsidePalette(event.target)) return;
      if (document.querySelector('dialog[open]:not(.cmdk)')) return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const close = useCallback(() => setOpen(false), []);
  const run = useCallback(
    (command: Command) => {
      recordRecent(command.id);
      flushSync(() => setOpen(false));
      void command.run({ openModal: modal.open });
    },
    [modal.open],
  );

  return open ? <PaletteDialog onClose={close} onRun={run} /> : null;
}
