import type { ComponentProps } from 'react';
import { cn } from './cn.js';
import type { CommonProps } from './types.js';

type PartProps<T extends 'div' | 'p'> = Omit<ComponentProps<T>, 'className'> &
  CommonProps;

export function Alert({ className, effect, ...props }: PartProps<'div'>) {
  return (
    <div
      {...props}
      data-slot="alert"
      data-effect={effect}
      className={cn(
        'flex flex-none items-center gap-2 border-b border-line bg-surface-raised px-3 py-1 text-fg-muted',
        className,
      )}
    />
  );
}

export function AlertDescription({
  className,
  effect,
  ...props
}: PartProps<'p'>) {
  return (
    <p
      {...props}
      data-slot="alert-description"
      data-effect={effect}
      className={cn('m-0 min-w-0 flex-1 text-13', className)}
    />
  );
}
