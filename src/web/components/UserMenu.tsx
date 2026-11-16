import { useEffect, useRef, useState } from 'react';
import type { Session } from '../api/client.js';
import { useSignOut } from '../api/hooks.js';
import { Icon } from './icons.js';

export function UserMenu({ user }: { user: Session }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const signOut = useSignOut();

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initial = user.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        type="button"
        className="user-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
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
        <div className="user-menu__popover" role="menu" aria-label="Account">
          <div className="user-menu__who">{user.name}</div>
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
