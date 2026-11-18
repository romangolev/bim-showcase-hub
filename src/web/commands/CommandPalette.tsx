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
import { notify } from '../tasks/notifications.js';
import { startTask } from '../tasks/taskStore.js';
import { filterCommands } from './fuzzy.js';
import { PIN_LIMIT, readPins, togglePin } from './pins.js';
import { readRecents, recordRecent } from './recents.js';
import { COMMANDS } from './registry.js';
import {
  formatShortcut,
  isEditableTarget,
  matchShortcut,
} from './shortcuts.js';
import type { Command } from './types.js';

export const RECENT_GROUP = 'Recent';
export const PINNED_GROUP = 'Pinned';

export function arrange(
  commands: readonly Command[],
  query: string,
  recents: readonly string[],
  pins: readonly string[] = [],
): Array<{ command: Command; group: string }> {
  if (query.trim()) {
    return filterCommands(commands, query).map((command) => ({
      command,
      group: command.group,
    }));
  }
  const byId = new Map(commands.map((command) => [command.id, command]));
  const pinned = pins
    .map((id) => byId.get(id))
    .filter((command): command is Command => command !== undefined);
  const pinnedIds = new Set(pinned.map((command) => command.id));
  const recent = recents
    .filter((id) => !pinnedIds.has(id))
    .map((id) => byId.get(id))
    .filter((command): command is Command => command !== undefined);
  const recentIds = new Set(recent.map((command) => command.id));
  return [
    ...pinned.map((command) => ({ command, group: PINNED_GROUP })),
    ...recent.map((command) => ({ command, group: RECENT_GROUP })),
    ...commands
      .filter(
        (command) => !pinnedIds.has(command.id) && !recentIds.has(command.id),
      )
      .map((command) => ({ command, group: command.group })),
  ];
}

interface DialogProps {
  error: string | null;
  onClose: () => void;
  onRun: (command: Command) => void;
}

function PaletteDialog({ error, onClose, onRun }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  const [recents] = useState(readRecents);
  const [pins, setPins] = useState(readPins);
  const [query, setQuery] = useState('');
  const commands = useMemo(() => COMMANDS.list(), [query]);
  const [active, setActive] = useState(0);
  const items = useMemo(
    () => arrange(commands, query, recents, pins),
    [commands, query, recents, pins],
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
      if (!entry) return;
      if (event.shiftKey) {
        const change = togglePin(entry.command.id);
        const nextPins = readPins();
        setPins(nextPins);
        const nextItems = arrange(commands, query, recents, nextPins);
        const at = nextItems.findIndex(
          (item) => item.command.id === entry.command.id,
        );
        setActive(change.pinned && at >= 0 ? at : 0);
        if (change.evicted) {
          const evicted = commands.find(
            (command) => command.id === change.evicted,
          );
          notify(
            `Pinned ${entry.command.title}. ${evicted?.title ?? change.evicted} was unpinned to keep ${PIN_LIMIT}.`,
            { tone: 'info' },
          );
        }
        return;
      }
      if (!entry.command.disabled) onRun(entry.command);
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
            const heading = !query.trim() && group !== previous;
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
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => setActive(index)}
                  onClick={() => {
                    if (!command.disabled) onRun(command);
                  }}
                  onKeyDown={onKeyDown}
                >
                  <span className="cmdk__title">{command.title}</span>
                  {command.disabled ? (
                    <span className="cmdk__reason">{command.disabled}</span>
                  ) : command.keys?.[0] ? (
                    <kbd className="cmdk__reason">
                      {formatShortcut(command.keys[0])}
                    </kbd>
                  ) : null}
                </div>
              </Fragment>
            );
          })}
        </div>
        {error ? (
          <p className="cmdk__error" role="alert">
            {error}
          </p>
        ) : null}
        {items.length === 0 ? (
          <p className="cmdk__empty">No matching commands</p>
        ) : (
          <p className="cmdk__empty">
            Enter runs · Shift+Enter pins · Esc closes
          </p>
        )}
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

function typingOutsidePalette(target: EventTarget | null): boolean {
  return (
    isEditableTarget(target) &&
    !(target instanceof Element && target.closest('.cmdk') !== null)
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modal = useModal();

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (!isPaletteShortcut(event) || event.isComposing) return;
      if (typingOutsidePalette(event.target)) return;
      if (document.querySelector('dialog[open]:not(.cmdk)')) return;
      event.preventDefault();
      setError(null);
      setOpen((value) => !value);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const close = useCallback(() => {
    setError(null);
    setOpen(false);
  }, []);
  const run = useCallback(
    (command: Command) => {
      recordRecent(command.id);
      flushSync(() => setOpen(false));
      const report = (failure: unknown) => {
        startTask({ label: command.title }).fail(failure);
        const reason =
          failure instanceof Error && failure.message
            ? failure.message
            : 'Something went wrong';
        setError(`${command.title} failed: ${reason}`);
        notify(`${command.title} failed: ${reason}`, { tone: 'error' });
        setOpen(true);
      };
      try {
        Promise.resolve(command.run({ openModal: modal.open })).catch(report);
      } catch (error) {
        report(error);
      }
    },
    [modal.open],
  );

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (!(event.ctrlKey || event.metaKey || event.altKey)) return;
      if (document.querySelector('dialog[open]')) return;
      if (isEditableTarget(event.target)) return;
      const command = matchShortcut(COMMANDS.list(), event);
      if (!command || command.disabled) return;
      event.preventDefault();
      run(command);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run]);

  return open ? (
    <PaletteDialog error={error} onClose={close} onRun={run} />
  ) : null;
}
