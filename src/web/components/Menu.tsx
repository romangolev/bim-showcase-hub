import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../ui/Button.js';
import { IconButton } from '../ui/IconButton.js';
import {
  MenuCheckboxItem,
  MenuHint,
  MenuInertItem,
  MenuItem,
  MenuItemIndicator,
  MenuPopup,
  Menu as MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from '../ui/Menu.js';
import { Icon, type IconName } from './icons.js';

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
  triggerVariant?: 'icon' | 'button' | 'unstyled';
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

const KEEP_FOCUS = ['outside-press', 'focus-out'];

export function Menu({
  label,
  title,
  trigger,
  items,
  hint,
  className,
  triggerClassName,
  triggerVariant = triggerClassName ? 'unstyled' : 'icon',
  align = 'end',
  anchor,
  onClose,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<MenuEntry[]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pickedRef = useRef<(() => void) | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const close = (restore: boolean) => {
    setOpen(false);
    if (restore) triggerRef.current?.focus();
    onClose?.(restore);
  };

  const anchorKey = anchor ? `${anchor.x},${anchor.y}` : null;
  useEffect(() => {
    if (anchorKey === null) return;
    setEntries(itemsRef.current());
    setOpen(true);
  }, [anchorKey]);

  const redirected = useRef(false);
  if (!open) redirected.current = false;

  const point = useMemo(() => {
    if (anchorKey === null) return undefined;
    const [x, y] = anchorKey.split(',').map(Number) as [number, number];
    return {
      getBoundingClientRect: () => DOMRect.fromRect({ x, y }),
    };
  }, [anchorKey]);

  const triggerProps = {
    title: title ?? label,
    className: triggerClassName,
  };

  return (
    <MenuRoot
      open={open}
      modal={false}
      onOpenChange={(next, details) => {
        if (next) {
          setEntries(items());
          setOpen(true);
        } else {
          const picked = pickedRef.current;
          pickedRef.current = null;
          close(!KEEP_FOCUS.includes(details.reason));
          picked?.();
        }
      }}
    >
      {anchor === undefined ? (
        <span className={['menu-host', className].filter(Boolean).join(' ')}>
          <MenuTrigger
            ref={triggerRef}
            render={
              triggerVariant === 'icon' ? (
                <IconButton label={label ?? ''} {...triggerProps} />
              ) : triggerVariant === 'button' ? (
                <Button aria-label={label} {...triggerProps} />
              ) : (
                <button type="button" aria-label={label} {...triggerProps} />
              )
            }
          >
            {trigger}
          </MenuTrigger>
        </span>
      ) : null}
      <MenuPopup
        onFocus={(event) => {
          if (anchor === undefined || redirected.current) return;
          if (event.target !== event.currentTarget) return;
          redirected.current = true;
          event.currentTarget
            .querySelector<HTMLElement>(
              '[data-slot="menu-item"], [data-slot="menu-checkbox-item"]',
            )
            ?.focus();
        }}
        aria-label={label}
        anchor={point}
        align={anchor === undefined ? align : 'start'}
        sideOffset={anchor === undefined ? 4 : 0}
        finalFocus={false}
      >
        {hint ? <MenuHint>{hint}</MenuHint> : null}
        {entries.map((entry) => {
          if (entry.kind === 'separator') {
            return <MenuSeparator key={entry.id} />;
          }
          const content = (
            <>
              <MenuItemIndicator>
                {entry.checked ? <Icon name="check" size={14} /> : null}
              </MenuItemIndicator>
              {entry.icon ? (
                <Icon name={entry.icon} size={14} className="menu-icon" />
              ) : null}
              {entry.label}
            </>
          );
          const select = () => {
            pickedRef.current = entry.onSelect;
          };
          if (entry.disabled) {
            return (
              <MenuInertItem
                key={entry.id}
                checked={entry.checked}
                title={entry.description}
              >
                {content}
              </MenuInertItem>
            );
          }
          return entry.checked === undefined ? (
            <MenuItem key={entry.id} title={entry.description} onClick={select}>
              {content}
            </MenuItem>
          ) : (
            <MenuCheckboxItem
              key={entry.id}
              checked={entry.checked}
              closeOnClick
              title={entry.description}
              onClick={select}
            >
              {content}
            </MenuCheckboxItem>
          );
        })}
      </MenuPopup>
    </MenuRoot>
  );
}
