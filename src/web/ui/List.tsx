import { useRender } from '@base-ui/react/use-render';
import type { ComponentProps } from 'react';
import { cn } from './cn.js';
import type { CommonProps } from './types.js';

export type ListProps = Omit<useRender.ComponentProps<'ul'>, 'className'> &
  CommonProps;

export function List({ className, effect, render, ref, ...props }: ListProps) {
  return useRender({
    defaultTagName: 'ul',
    render,
    ref,
    props: {
      ...props,
      'data-slot': 'list',
      'data-effect': effect,
      className: cn('m-0 flex list-none flex-col gap-2 p-0', className),
    },
  });
}

export type ListItemProps = Omit<ComponentProps<'li'>, 'className'> &
  CommonProps;

export function ListItem({ className, effect, ...props }: ListItemProps) {
  return (
    <li
      {...props}
      data-slot="list-item"
      data-effect={effect}
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1 *:first:min-w-0 *:first:grow *:first:basis-40',
        className,
      )}
    />
  );
}
