import type { ComponentProps } from 'react';
import { cardClasses } from './Card.js';
import { cn } from './cn.js';
import type { CommonProps } from './types.js';

type PartProps<T extends 'section' | 'header' | 'div'> = Omit<
  ComponentProps<T>,
  'className'
> &
  CommonProps;

export type DrawerProps = PartProps<'section'> & { collapsed?: boolean };

export function Drawer({
  className,
  effect,
  collapsed = false,
  ...props
}: DrawerProps) {
  return (
    <section
      {...props}
      data-slot="drawer"
      data-collapsed={collapsed ? '' : undefined}
      data-effect={effect}
      className={cn(cardClasses, 'group/drawer gap-0 p-0', className)}
    />
  );
}

export function DrawerHeader({
  className,
  effect,
  ...props
}: PartProps<'header'>) {
  return (
    <header
      {...props}
      data-slot="drawer-header"
      data-effect={effect}
      className={cn(
        'sticky top-0 z-sticky flex min-h-9 flex-none flex-wrap items-center justify-start gap-x-3 gap-y-0 rounded-t-surface bg-surface px-3 py-2 group-data-collapsed/drawer:rounded-b-surface',
        className,
      )}
    />
  );
}

export function DrawerBody({ className, effect, ...props }: PartProps<'div'>) {
  return (
    <div
      {...props}
      data-slot="drawer-body"
      data-effect={effect}
      className={cn(
        '@container h-(--ui-drawer-body) overflow-auto border-t border-line px-3 py-2 transition-all motion-reduce:transition-none group-data-collapsed/drawer:invisible group-data-collapsed/drawer:h-0 group-data-collapsed/drawer:overflow-hidden group-data-collapsed/drawer:border-t-0 group-data-collapsed/drawer:py-0',
        className,
      )}
    />
  );
}
