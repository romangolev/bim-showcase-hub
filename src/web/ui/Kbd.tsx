import type { ComponentProps } from 'react';
import { cn } from './cn.js';
import type { CommonProps } from './types.js';

export type KbdProps = Omit<ComponentProps<'kbd'>, 'className'> & CommonProps;

export function Kbd({ className, effect, ...props }: KbdProps) {
  return (
    <kbd
      {...props}
      data-slot="kbd"
      data-effect={effect}
      className={cn(
        'inline-flex items-center rounded-badge border border-line bg-fill px-1 text-12 whitespace-nowrap text-fg-muted',
        className,
      )}
    />
  );
}
