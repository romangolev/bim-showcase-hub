import type { ComponentProps } from 'react';
import { cn } from './cn.js';
import type { CommonProps, Size } from './types.js';

const WIDTHS = ['72%', '54%', '88%', '46%', '66%'];

const sizes: Record<Size, string> = {
  default: 'gap-3 py-4',
  small: 'gap-2 py-1',
};

export type SkeletonProps = Omit<ComponentProps<'div'>, 'className'> &
  CommonProps & { rows?: number; size?: Size };

export function Skeleton({
  className,
  effect,
  rows = 3,
  size = 'default',
  children,
  ...props
}: SkeletonProps) {
  return (
    <div
      {...props}
      data-slot="skeleton"
      data-size={size}
      data-effect={effect}
      className={cn('flex min-w-0 flex-col', sizes[size], className)}
    >
      {children}
      {Array.from({ length: rows }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          data-slot="skeleton-bar"
          className="block h-2.5 max-w-full animate-pulse rounded-badge bg-fill-hover motion-reduce:animate-none"
          style={{ width: WIDTHS[index % WIDTHS.length] }}
        />
      ))}
    </div>
  );
}
