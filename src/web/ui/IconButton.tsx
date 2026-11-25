import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cn } from './cn.js';
import type { CommonProps } from './types.js';

const base =
  'inline-flex size-hit cursor-pointer items-center justify-center rounded-control border border-line bg-transparent p-0 text-fg-subtle transition-colors motion-reduce:transition-none not-data-disabled:not-aria-disabled:hover:bg-fill not-data-disabled:not-aria-disabled:hover:text-fg not-data-disabled:not-aria-disabled:active:bg-fill-active data-disabled:cursor-not-allowed data-disabled:text-fg-disabled aria-disabled:cursor-not-allowed aria-disabled:text-fg-disabled';

export type IconButtonProps = Omit<
  ButtonPrimitive.Props,
  'className' | 'aria-label'
> &
  CommonProps & { label: string };

export function IconButton({
  className,
  effect,
  label,
  ...props
}: IconButtonProps) {
  return (
    <ButtonPrimitive
      {...props}
      aria-label={label}
      data-slot="icon-button"
      data-effect={effect}
      className={cn(base, className)}
    />
  );
}
