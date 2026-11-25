import type { ComponentProps } from 'react';
import { cn } from './cn.js';
import type { CommonProps } from './types.js';

export type SpinnerProps = Omit<
  ComponentProps<'svg'>,
  'className' | 'width' | 'height'
> &
  CommonProps & { size?: number; label?: string };

export function Spinner({
  className,
  effect,
  size = 16,
  label,
  ...props
}: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      focusable="false"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...props}
      data-slot="spinner"
      data-effect={effect}
      className={cn(
        'flex-none animate-spin motion-reduce:animate-none',
        className,
      )}
    >
      <path d="M21 12a9 9 0 1 1-6.2-8.55" />
    </svg>
  );
}
