import type { ComponentProps } from 'react';
import { cn } from './cn.js';
import type { CommonProps } from './types.js';

export const cardClasses =
  'flex min-h-0 min-w-0 flex-col rounded-surface border border-line bg-surface font-sans text-14 font-body tracking-body text-fg-muted shadow-inset';

type PartProps<T extends 'section' | 'header' | 'h2'> = Omit<
  ComponentProps<T>,
  'className'
> &
  CommonProps;

export function Card({ className, effect, ...props }: PartProps<'section'>) {
  return (
    <section
      {...props}
      data-slot="card"
      data-effect={effect}
      className={cn(cardClasses, 'gap-3 p-3', className)}
    />
  );
}

export function CardHeader({
  className,
  effect,
  ...props
}: PartProps<'header'>) {
  return (
    <header
      {...props}
      data-slot="card-header"
      data-effect={effect}
      className={cn(
        'flex flex-none items-center justify-between gap-3',
        className,
      )}
    />
  );
}

export function CardTitle({ className, effect, ...props }: PartProps<'h2'>) {
  return (
    <h2
      {...props}
      data-slot="card-title"
      data-effect={effect}
      className={cn('m-0 text-16 font-light tracking-tight text-fg', className)}
    />
  );
}
