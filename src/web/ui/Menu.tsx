import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react';
import { cn } from './cn.js';
import { topLayerContainer } from './topLayer.js';
import type { CommonProps } from './types.js';

interface MenuContextValue {
  trigger: HTMLElement | null;
  setTrigger: (node: HTMLElement | null) => void;
}

const MenuContext = createContext<MenuContextValue | null>(null);

export type MenuProps = MenuPrimitive.Root.Props;

export function Menu(props: MenuProps) {
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const value = useMemo(() => ({ trigger, setTrigger }), [trigger]);
  return (
    <MenuContext.Provider value={value}>
      <MenuPrimitive.Root {...props} />
    </MenuContext.Provider>
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
  const context = useContext(MenuContext);
  return (
    <MenuPrimitive.Trigger
      {...props}
      ref={(node: HTMLElement | null) => {
        context?.setTrigger(node);
        if (typeof ref === 'function') ref(node as never);
        else if (ref) (ref as { current: unknown }).current = node;
      }}
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
  const context = useContext(MenuContext);
  return (
    <MenuPrimitive.Portal
      container={container ?? topLayerContainer(context?.trigger ?? null)}
    >
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
