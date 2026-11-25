import type { ComponentProps } from 'react';
import { cn } from './cn.js';
import { useFieldControl } from './Field.js';
import type { CommonProps } from './types.js';

export const checkClasses =
  'cursor-pointer accent-accent-fill disabled:cursor-not-allowed';

export type CheckboxProps = Omit<
  ComponentProps<'input'>,
  'className' | 'type'
> &
  CommonProps & { onCheckedChange?: (checked: boolean) => void };

export function Checkbox({
  className,
  effect,
  onChange,
  onCheckedChange,
  ...props
}: CheckboxProps) {
  return (
    <input
      {...useFieldControl(props)}
      type="checkbox"
      onChange={(event) => {
        onChange?.(event);
        onCheckedChange?.(event.target.checked);
      }}
      data-slot="checkbox"
      data-checked={props.checked ? '' : undefined}
      data-effect={effect}
      className={cn(checkClasses, className)}
    />
  );
}
