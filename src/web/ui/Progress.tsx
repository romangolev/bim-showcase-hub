import { Progress as ProgressPrimitive } from '@base-ui/react/progress';
import { cn } from './cn.js';
import type { CommonProps } from './types.js';

export type ProgressProps = Omit<
  ProgressPrimitive.Root.Props,
  'className' | 'aria-label' | 'children' | 'getAriaValueText' | 'value'
> &
  CommonProps & {
    label: string;
    value?: number | null;
    valueText?: string;
  };

export function Progress({
  className,
  effect,
  label,
  valueText,
  value = null,
  ...props
}: ProgressProps) {
  return (
    <ProgressPrimitive.Root
      {...props}
      value={value}
      aria-label={label}
      getAriaValueText={(formatted, current) =>
        (current == null ? valueText : formatted) as string
      }
      data-slot="progress"
      data-effect={effect}
      className={cn('block w-full', className)}
    >
      <ProgressPrimitive.Track
        data-slot="progress-track"
        className="block h-1 w-full overflow-hidden rounded-pill bg-fill"
      >
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className="block h-full bg-accent-fill transition-all motion-reduce:transition-none data-indeterminate:w-full data-indeterminate:opacity-50 motion-safe:data-indeterminate:animate-pulse"
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  );
}
