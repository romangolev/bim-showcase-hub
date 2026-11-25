import type { ComponentProps } from 'react';
import { cn } from './cn.js';
import { useFieldControl } from './Field.js';
import type { CommonProps } from './types.js';

export const inputClasses =
  'min-h-hit min-w-0 rounded-item border border-line-strong bg-surface-raised px-2 text-14 text-fg disabled:cursor-not-allowed';

export type InputProps = Omit<ComponentProps<'input'>, 'className'> &
  CommonProps;

export function Input({ className, effect, ...props }: InputProps) {
  return (
    <input
      {...useFieldControl(props)}
      data-slot="input"
      data-effect={effect}
      className={cn(inputClasses, className)}
    />
  );
}
