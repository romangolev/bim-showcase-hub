import { type ComponentProps, useState } from 'react';
import { cn } from './cn.js';
import { useFieldControl } from './Field.js';
import { inputClasses } from './Input.js';
import type { CommonProps } from './types.js';

export type NumberFieldProps = Omit<
  ComponentProps<'input'>,
  | 'className'
  | 'type'
  | 'value'
  | 'min'
  | 'max'
  | 'onChange'
  | 'onBlur'
  | 'onKeyDown'
> &
  CommonProps & {
    value: number;
    min: number;
    max?: number;
    onValueCommitted: (value: number) => void;
  };

export function NumberField({
  className,
  effect,
  value,
  min,
  max = Number.POSITIVE_INFINITY,
  onValueCommitted,
  ...props
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const parsed = Math.floor(Number(draft));
    setDraft(null);
    if (draft.trim() === '' || !Number.isFinite(parsed)) return;
    onValueCommitted(Math.min(max, Math.max(min, parsed)));
  };

  return (
    <input
      {...useFieldControl(props)}
      type="number"
      min={min}
      max={Number.isFinite(max) ? max : undefined}
      value={draft ?? String(value)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
      }}
      data-slot="number-field"
      data-effect={effect}
      className={cn(inputClasses, className)}
    />
  );
}
