import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './icons.js';
import { moveFocus, onEscape, usePopover } from './usePopover.js';

export type MenuEntry =
  | {
      kind?: 'item';
      id: string;
      label: string;
      onSelect: () => void;
      disabled?: boolean;
      checked?: boolean;
      icon?: IconName;
      description?: string;
    }
  | { kind: 'separator'; id: string };

interface MenuBaseProps {
  title?: string;
  items: () => MenuEntry[];
  hint?: string;
  className?: string;
  triggerClassName?: string;
  align?: 'start' | 'end';
  onClose?: (restoreFocus: boolean) => void;
}

export type MenuProps = MenuBaseProps &
  (
    | { label: string; trigger: ReactNode; anchor?: undefined }
    | {
        label?: string;
        trigger?: undefined;
        anchor: { x: number; y: number } | null;
      }
  );

function CheckMark({ checked }: { checked?: boolean }) {
  return (
    <span className="menu__check">
      {checked ? <Icon name="check" size={14} /> : null}
    </span>
  );
}

export function Menu({
  label,
  title,
  trigger,
  items,
  hint,
  className,
  triggerClassName = 'icon-button',
  align = 'end',
  anchor,
  onClose,
}: MenuProps) {
  const [open, setOpen] = useState<null | 'first' | 'last'>(null);
  const [entries, setEntries] = useState<MenuEntry[]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const focusables = useCallback(
    () =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>(
          '[role^="menuitem"]:not(:disabled)',
        ) ?? [],
      ),
    [],
  );

  const show = (where: 'first' | 'last') => {
    setEntries(items());
    setOpen(where);
  };

  const close = useCallback((restore: boolean) => {
    setOpen(null);
    if (restore) triggerRef.current?.focus();
    onCloseRef.current?.(restore);
  }, []);

  const anchorKey = anchor ? `${anchor.x},${anchor.y}` : null;
  const position = usePopover({
    open: open !== null,
    triggerRef,
    popoverRef: menuRef,
    onDismiss: () => close(false),
    align,
    anchor: anchor ?? undefined,
  });

  useEffect(() => {
    if (anchorKey === null) return;
    setEntries(itemsRef.current());
    setOpen('first');
  }, [anchorKey]);

  const pendingFocus = useRef<null | 'first' | 'last'>(null);

  useLayoutEffect(() => {
    if (open) pendingFocus.current = open;
  }, [open, anchorKey]);

  useLayoutEffect(() => {
    const where = pendingFocus.current;
    if (!position || !where) return;
    pendingFocus.current = null;
    const list = focusables();
    (where === 'last' ? list[list.length - 1] : list[0])?.focus();
  }, [position, focusables]);

  const onMenuKeyDown = (event: KeyboardEvent) => {
    if (onEscape(event, () => close(true))) return;
    const list = focusables();
    if (moveFocus(event, list)) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      list[list.indexOf(document.activeElement as HTMLButtonElement)]?.click();
    } else if (event.key === 'Tab') {
      close(false);
    }
  };

  const select = (entry: MenuEntry) => {
    if (entry.kind === 'separator' || entry.disabled) return;
    close(true);
    entry.onSelect();
  };

  return (
    <div
      className={['menu', anchor !== undefined && 'menu--anchored', className]
        .filter(Boolean)
        .join(' ')}
    >
      {anchor === undefined ? (
        <button
          ref={triggerRef}
          type="button"
          className={triggerClassName}
          aria-label={label}
          title={title ?? label}
          aria-haspopup="menu"
          aria-expanded={open !== null}
          aria-controls={open ? menuId : undefined}
          onClick={() => (open ? close(false) : show('first'))}
          onKeyDown={(event) => {
            if (open) return;
            if (
              event.key === 'ArrowDown' ||
              event.key === 'Enter' ||
              event.key === ' '
            ) {
              event.preventDefault();
              show('first');
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              show('last');
            }
          }}
        >
          {trigger}
        </button>
      ) : null}
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className="menu__popover"
              role="menu"
              aria-label={label}
              tabIndex={-1}
              style={
                position
                  ? { top: position.top, left: position.left }
                  : { top: 0, left: 0, visibility: 'hidden' }
              }
              onKeyDown={onMenuKeyDown}
            >
              {hint ? (
                <button
                  type="button"
                  role="menuitem"
                  className="menu__item menu__item--hint"
                  disabled
                >
                  {hint}
                </button>
              ) : null}
              {entries.map((entry) => {
                if (entry.kind === 'separator') {
                  return <hr key={entry.id} className="menu__separator" />;
                }
                return entry.checked === undefined ? (
                  <button
                    key={entry.id}
                    type="button"
                    role="menuitem"
                    className="menu__item"
                    disabled={entry.disabled}
                    title={entry.description}
                    onClick={() => select(entry)}
                  >
                    <CheckMark checked={entry.checked} />
                    {entry.label}
                  </button>
                ) : (
                  <button
                    key={entry.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={entry.checked}
                    className="menu__item"
                    disabled={entry.disabled}
                    onClick={() => select(entry)}
                  >
                    <CheckMark checked={entry.checked} />
                    {entry.icon ? (
                      <Icon
                        name={entry.icon}
                        size={14}
                        className="menu__icon"
                      />
                    ) : null}
                    {entry.label}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
