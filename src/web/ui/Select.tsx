import type { ComponentProps } from 'react';
import { cn } from './cn.js';
import { useFieldControl } from './Field.js';
import { inputClasses } from './Input.js';
import type { CommonProps } from './types.js';

export type SelectProps = Omit<
  ComponentProps<'select'>,
  'className' | 'multiple' | 'size'
> &
  CommonProps & { onValueChange?: (value: string) => void };

export function Select({
  className,
  effect,
  onChange,
  onValueChange,
  ...props
}: SelectProps) {
  return (
    <select
      {...useFieldControl(props)}
      onChange={(event) => {
        onChange?.(event);
        onValueChange?.(event.target.value);
      }}
      data-slot="select"
      data-effect={effect}
      className={cn(inputClasses, className)}
    />
  );
}

export type SelectOptionProps = Omit<ComponentProps<'option'>, 'className'> &
  CommonProps;

export function SelectOption({
  className,
  effect,
  ...props
}: SelectOptionProps) {
  return (
    <option
      {...props}
      data-slot="select-option"
      data-effect={effect}
      className={cn(className)}
    />
  );
}
