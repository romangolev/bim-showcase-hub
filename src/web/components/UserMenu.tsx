import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { Session } from '../api/client.js';
import { useSignOut } from '../api/hooks.js';
import { Icon } from './icons.js';

export function UserMenu({ user }: { user: Session }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const signOut = useSignOut();

  const items = useCallback(
    () =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>(
          '[role="menuitem"]:not(:disabled)',
        ) ?? [],
      ),
    [],
  );

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  };

  useEffect(() => {
    if (open) {
      items()[0]?.focus();
    }
  }, [open, items]);

  const onMenuKeyDown = (event: KeyboardEvent) => {
    const list = items();
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

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const initial = user.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="user-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {user.picture ? (
          <img className="avatar" src={user.picture} alt="" />
        ) : (
          <span className="avatar avatar--initial" aria-hidden="true">
            {initial}
          </span>
        )}
        <span className="user-menu__name">{user.name}</span>
      </button>
      {open ? (
        <div
          ref={menuRef}
          className="user-menu__popover"
          role="menu"
          aria-label="Account"
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
        >
          <div className="user-menu__who" role="presentation">
            {user.name}
          </div>
          <button
            type="button"
            role="menuitem"
            className="user-menu__item"
            disabled={signOut.isPending}
            onClick={() => signOut.mutate()}
          >
            <Icon name="logout" size={14} />
            Sign out
          </button>
          {signOut.isError ? (
            <div className="user-menu__error" role="alert">
              Could not sign out. Try again.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
