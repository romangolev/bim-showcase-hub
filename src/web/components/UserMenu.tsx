import { useRef, useState } from 'react';
import type { Session } from '../api/client.js';
import { useSignOut } from '../api/hooks.js';
import { useT } from '../i18n/i18n.js';
import { useModal } from '../modal/index.js';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '../ui/Menu.js';
import { Icon } from './icons.js';

export function UserMenu({ user }: { user: Session }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pickedRef = useRef<(() => void) | null>(null);
  const signOut = useSignOut();
  const modal = useModal();
  const t = useT();

  const initial = user.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="user-menu">
      <Menu
        open={open}
        modal={false}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) return;
          const picked = pickedRef.current;
          pickedRef.current = null;
          if (!picked) return;
          triggerRef.current?.focus();
          picked();
        }}
      >
        <MenuTrigger ref={triggerRef} className="user-menu__trigger">
          {user.picture ? (
            <img className="avatar" src={user.picture} alt="" />
          ) : (
            <span className="avatar avatar--initial" aria-hidden="true">
              {initial}
            </span>
          )}
          <span className="user-menu__name">{user.name}</span>
        </MenuTrigger>
        <MenuPopup aria-label={t('userMenu.account')} sideOffset={8}>
          <div className="user-menu__who" role="presentation">
            {user.name}
          </div>
          <MenuItem
            onClick={() => {
              pickedRef.current = () => modal.open('settings');
            }}
          >
            <Icon name="settings" size={14} />
            {t('topbar.settings')}
          </MenuItem>
          <MenuItem
            disabled={signOut.isPending}
            closeOnClick={false}
            onClick={() => signOut.mutate()}
          >
            <Icon name="logout" size={14} />
            {t('userMenu.signOut')}
          </MenuItem>
          {signOut.isError ? (
            <div className="user-menu__error" role="alert">
              {t('userMenu.signOutFailed')}
            </div>
          ) : null}
        </MenuPopup>
      </Menu>
    </div>
  );
}
