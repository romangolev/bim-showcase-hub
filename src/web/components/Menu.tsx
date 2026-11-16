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
import { Icon } from './icons.js';

export type MenuEntry =
  | {
      kind?: 'item';
      id: string;
      label: string;
      onSelect: () => void;
      disabled?: boolean;
      checked?: boolean;
    }
  | { kind: 'separator'; id: string };

export interface MenuProps {
  label: string;
  title?: string;
  trigger: ReactNode;
  items: () => MenuEntry[];
  className?: string;
  triggerClassName?: string;
}

interface Position {
  top: number;
  left: number;
}

const GAP = 4;

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
  className,
  triggerClassName = 'icon-button',
}: MenuProps) {
  const [open, setOpen] = useState<null | 'first' | 'last'>(null);
  const [entries, setEntries] = useState<MenuEntry[]>([]);
  const [position, setPosition] = useState<Position | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

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
  }, []);

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    const menu = menuRef.current;
    if (!rect || !menu) return;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
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

  const pendingFocus = useRef<null | 'first' | 'last'>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    pendingFocus.current = open;
    place();
  }, [open, place]);

  useLayoutEffect(() => {
    const where = pendingFocus.current;
    if (!position || !where) return;
    pendingFocus.current = null;
    const list = focusables();
    (where === 'last' ? list[list.length - 1] : list[0])?.focus();
  }, [position, focusables]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        close(false);
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
  }, [open, close, place]);

  const onMenuKeyDown = (event: KeyboardEvent) => {
    const list = focusables();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const move = (next: number) => {
      event.preventDefault();
      list[(next + list.length) % list.length]?.focus();
    };
    switch (event.key) {
      case 'ArrowDown':
        move(index + 1);
        break;
      case 'ArrowUp':
        move(index - 1);
        break;
      case 'Home':
        move(0);
        break;
      case 'End':
        move(list.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        list[index]?.click();
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
    }
  };

  const select = (entry: MenuEntry) => {
    if (entry.kind === 'separator' || entry.disabled) return;
    close(true);
    entry.onSelect();
  };

  return (
    <div className={className ? `menu ${className}` : 'menu'}>
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
