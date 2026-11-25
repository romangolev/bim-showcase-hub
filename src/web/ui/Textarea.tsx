import type { ComponentProps } from 'react';
import { cn } from './cn.js';
import { useFieldControl } from './Field.js';
import { inputClasses } from './Input.js';
import type { CommonProps } from './types.js';

export type TextareaProps = Omit<ComponentProps<'textarea'>, 'className'> &
  CommonProps;

export function Textarea({ className, effect, ...props }: TextareaProps) {
  return (
    <textarea
      {...useFieldControl(props)}
      data-slot="textarea"
      data-effect={effect}
      className={cn(inputClasses, className)}
    />
  );
}
