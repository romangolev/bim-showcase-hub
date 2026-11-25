import type { ComponentProps } from 'react';
import { cn } from './cn.js';
import { useFieldControl } from './Field.js';
import type { CommonProps } from './types.js';

const base =
  'relative m-0 h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-pill border border-line-strong bg-surface-raised transition-colors before:absolute before:start-0.5 before:top-1/2 before:size-3.5 before:-translate-y-1/2 before:rounded-pill before:bg-fg-subtle before:transition-transform checked:border-accent-fill checked:bg-accent-fill checked:before:translate-x-4 checked:before:bg-on-accent disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none motion-reduce:before:transition-none rtl:checked:before:-translate-x-4';

export type SwitchProps = Omit<
  ComponentProps<'input'>,
  'className' | 'type' | 'role'
> &
  CommonProps & { onCheckedChange?: (checked: boolean) => void };

export function Switch({
  className,
  effect,
  onChange,
  onCheckedChange,
  ...props
}: SwitchProps) {
  return (
    <input
      {...useFieldControl(props)}
      type="checkbox"
      role="switch"
      aria-checked={props.checked}
      onChange={(event) => {
        onChange?.(event);
        onCheckedChange?.(event.target.checked);
      }}
      data-slot="switch"
      data-checked={props.checked ? '' : undefined}
      data-effect={effect}
      className={cn(base, className)}
    />
  );
}
