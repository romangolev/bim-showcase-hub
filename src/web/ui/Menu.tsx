import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn.js';
import {
  TriggerScope,
  usePopupContainer,
  useTriggerRef,
  useTriggerScopeValue,
} from './topLayer.js';
import type { CommonProps } from './types.js';

export type MenuProps = MenuPrimitive.Root.Props;

export function Menu(props: MenuProps) {
  return (
    <TriggerScope.Provider value={useTriggerScopeValue()}>
      <MenuPrimitive.Root {...props} />
    </TriggerScope.Provider>
  );
}

export type MenuTriggerProps = Omit<MenuPrimitive.Trigger.Props, 'className'> &
  CommonProps;

export function MenuTrigger({
  className,
  effect,
  ref,
  ...props
}: MenuTriggerProps) {
  const triggerRef = useTriggerRef(ref);
  return (
    <MenuPrimitive.Trigger
      {...props}
      ref={triggerRef}
      data-slot={props.render ? undefined : 'menu-trigger'}
      data-effect={effect}
      className={className}
    />
  );
}

const popup =
  'z-popup max-h-(--available-height) min-w-menu overflow-y-auto rounded-surface border border-line bg-surface p-1 font-sans text-13 text-fg-muted shadow-inset outline-none';

export type MenuPopupProps = Omit<MenuPrimitive.Popup.Props, 'className'> &
  CommonProps & {
    container?: HTMLElement | null;
    anchor?: MenuPrimitive.Positioner.Props['anchor'];
    side?: MenuPrimitive.Positioner.Props['side'];
    align?: MenuPrimitive.Positioner.Props['align'];
    sideOffset?: number;
    children?: ReactNode;
  };

export function MenuPopup({
  className,
  effect,
  container,
  anchor,
  side = 'bottom',
  align = 'end',
  sideOffset = 4,
  ...props
}: MenuPopupProps) {
  const host = usePopupContainer(container);
  return (
    <MenuPrimitive.Portal container={host}>
      <MenuPrimitive.Positioner
        anchor={anchor}
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={4}
        positionMethod="fixed"
        data-slot="menu-positioner"
        className="z-popup"
      >
        <MenuPrimitive.Popup
          {...props}
          data-slot="menu-popup"
          data-effect={effect}
          className={cn(popup, className)}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

const item =
  'flex min-h-hit w-full cursor-pointer items-center gap-2 rounded-item ps-2 pe-3 text-start text-fg-muted outline-none transition-colors motion-reduce:transition-none data-highlighted:bg-fill-hover data-highlighted:text-fg data-disabled:cursor-not-allowed data-disabled:text-fg-disabled';

export type MenuItemProps = Omit<MenuPrimitive.Item.Props, 'className'> &
  CommonProps;

export function MenuItem({ className, effect, ...props }: MenuItemProps) {
  return (
    <MenuPrimitive.Item
      {...props}
      data-slot="menu-item"
      data-effect={effect}
      className={cn(item, className)}
    />
  );
}

export type MenuCheckboxItemProps = Omit<
  MenuPrimitive.CheckboxItem.Props,
  'className'
> &
  CommonProps;

export function MenuCheckboxItem({
  className,
  effect,
  ...props
}: MenuCheckboxItemProps) {
  return (
    <MenuPrimitive.CheckboxItem
      {...props}
      data-slot="menu-checkbox-item"
      data-effect={effect}
      className={cn(item, className)}
    />
  );
}

type PlainProps<T extends 'div' | 'span'> = Omit<
  ComponentProps<T>,
  'className'
> &
  CommonProps;

export function MenuItemIndicator({
  className,
  effect,
  ...props
}: PlainProps<'span'>) {
  return (
    <span
      {...props}
      data-slot="menu-item-indicator"
      data-effect={effect}
      className={cn(
        'inline-grid w-4 flex-none place-items-center text-accent',
        className,
      )}
    />
  );
}

export type MenuSeparatorProps = Omit<
  MenuPrimitive.Separator.Props,
  'className'
> &
  CommonProps;

export function MenuSeparator({
  className,
  effect,
  ...props
}: MenuSeparatorProps) {
  return (
    <MenuPrimitive.Separator
      {...props}
      data-slot="menu-separator"
      data-effect={effect}
      className={cn('my-1 h-0 border-t border-line', className)}
    />
  );
}

export type MenuGroupLabelProps = Omit<
  MenuPrimitive.GroupLabel.Props,
  'className'
> &
  CommonProps;

export function MenuGroupLabel({
  className,
  effect,
  ...props
}: MenuGroupLabelProps) {
  return (
    <MenuPrimitive.GroupLabel
      {...props}
      data-slot="menu-group-label"
      data-effect={effect}
      className={cn('ps-2 pe-3 py-1 text-12 text-fg-disabled', className)}
    />
  );
}

export type MenuInertItemProps = PlainProps<'div'> & { checked?: boolean };

export function MenuInertItem({
  className,
  effect,
  checked,
  ...props
}: MenuInertItemProps) {
  const shared = {
    ...props,
    'aria-disabled': true,
    'data-disabled': '',
    'data-slot': 'menu-inert-item',
    'data-effect': effect,
    className: cn(item, 'cursor-not-allowed', className),
  } as const;
  return checked === undefined ? (
    <div role="menuitem" tabIndex={-1} {...shared} />
  ) : (
    <div
      role="menuitemcheckbox"
      aria-checked={checked}
      tabIndex={-1}
      {...shared}
    />
  );
}

export function MenuHint({ className, effect, ...props }: PlainProps<'div'>) {
  return (
    <div
      {...props}
      role="menuitem"
      aria-disabled="true"
      tabIndex={-1}
      data-slot="menu-hint"
      data-effect={effect}
      className={cn(
        'max-w-menu-hint cursor-default ps-8 pe-2 pt-1 pb-2 text-13 leading-snug whitespace-normal text-fg-disabled',
        className,
      )}
    />
  );
}

export const MenuGroup = MenuPrimitive.Group;

export const MenuFilterProvider = MenuPrimitive.FilterProvider;

export type MenuInputProps = Omit<MenuPrimitive.Input.Props, 'className'> &
  CommonProps;

export function MenuInput({ className, effect, ...props }: MenuInputProps) {
  return (
    <MenuPrimitive.Input
      {...props}
      data-slot="menu-input"
      data-effect={effect}
      className={cn(
        'min-h-hit w-full rounded-item bg-transparent px-2 text-14 text-fg outline-none placeholder:text-fg-disabled',
        className,
      )}
    />
  );
}

export type MenuListProps = Omit<MenuPrimitive.List.Props, 'className'> &
  CommonProps;

export function MenuList({ className, effect, ...props }: MenuListProps) {
  return (
    <MenuPrimitive.List
      {...props}
      data-slot="menu-list"
      data-effect={effect}
      className={cn('outline-none', className)}
    />
  );
}

export type MenuEmptyProps = Omit<MenuPrimitive.Empty.Props, 'className'> &
  CommonProps;

export function MenuEmpty({ className, effect, ...props }: MenuEmptyProps) {
  return (
    <MenuPrimitive.Empty
      {...props}
      data-slot="menu-empty"
      data-effect={effect}
      className={cn('px-2 py-2 text-13 text-fg-disabled', className)}
    />
  );
}
