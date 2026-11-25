import type { ComponentProps } from 'react';
import { cn } from './cn.js';
import { useFieldControl } from './Field.js';
import type { CommonProps } from './types.js';

export type SliderProps = Omit<ComponentProps<'input'>, 'className' | 'type'> &
  CommonProps & { onValueChange?: (value: number) => void };

export function Slider({
  className,
  effect,
  onChange,
  onValueChange,
  ...props
}: SliderProps) {
  return (
    <input
      {...useFieldControl(props)}
      type="range"
      onChange={(event) => {
        onChange?.(event);
        onValueChange?.(Number(event.target.value));
      }}
      data-slot="slider"
      data-effect={effect}
      className={cn(
        'min-h-hit cursor-pointer accent-accent-fill disabled:cursor-not-allowed',
        className,
      )}
    />
  );
}
