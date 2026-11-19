import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { Session } from '../api/client.js';
import { useSignOut } from '../api/hooks.js';
import { useModal } from '../modal/index.js';
import { Icon } from './icons.js';
import { moveFocus, onEscape, useOutsidePointer } from './usePopover.js';

export function UserMenu({ user }: { user: Session }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const signOut = useSignOut();
  const modal = useModal();

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
    if (onEscape(event, () => close(true))) return;
    if (!moveFocus(event, items()) && event.key === 'Tab') close(false);
  };

  useOutsidePointer(open, [rootRef], () => setOpen(false));

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
            onClick={() => {
              close(true);
              modal.open('settings');
            }}
          >
            <Icon name="settings" size={14} />
            Settings
          </button>
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
