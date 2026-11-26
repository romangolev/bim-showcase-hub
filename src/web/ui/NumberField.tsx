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
    integer?: boolean;
    round?: 'floor' | 'nearest';
    emptyValue?: number;
    onDraftChange?: (value: number | null) => void;
    onValueCommitted: (value: number) => void;
  };

function readDraft(text: string): number | null {
  if (text.trim() === '') return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function NumberField({
  className,
  effect,
  value,
  min,
  max = Number.POSITIVE_INFINITY,
  integer = true,
  round = 'floor',
  emptyValue,
  step,
  onDraftChange,
  onValueCommitted,
  ...props
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const normalize = (input: number) => {
    const rounded = integer
      ? round === 'nearest'
        ? Math.round(input)
        : Math.floor(input)
      : input;
    return Math.min(max, Math.max(min, rounded));
  };

  const report = (text: string): number | null => {
    const parsed = readDraft(text);
    return parsed === null
      ? emptyValue === undefined
        ? null
        : normalize(emptyValue)
      : normalize(parsed);
  };

  const commit = () => {
    if (draft === null) return;
    const draftValue = report(draft);
    setDraft(null);
    if (draftValue !== null) onValueCommitted(draftValue);
  };

  return (
    <input
      {...useFieldControl(props)}
      type="number"
      min={min}
      max={Number.isFinite(max) ? max : undefined}
      step={step ?? (integer ? 1 : 'any')}
      value={draft ?? String(value)}
      onChange={(event) => {
        setDraft(event.target.value);
        onDraftChange?.(report(event.target.value));
      }}
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
