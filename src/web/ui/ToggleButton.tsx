import { Toggle } from '@base-ui/react/toggle';
import { type ButtonStyleProps, buttonClasses } from './Button.js';
import { cn } from './cn.js';
import type { CommonProps } from './types.js';

const pressed =
  'data-pressed:border-accent data-pressed:bg-accent-tint data-pressed:text-fg not-data-disabled:data-pressed:hover:bg-accent-tint';

export type ToggleButtonProps = Omit<Toggle.Props, 'className'> &
  CommonProps &
  Omit<ButtonStyleProps, 'tone'>;

export function ToggleButton({
  className,
  effect,
  variant = 'default',
  size = 'default',
  ...props
}: ToggleButtonProps) {
  return (
    <Toggle
      {...props}
      data-slot="toggle-button"
      data-variant={variant}
      data-size={size}
      data-effect={effect}
      className={cn(buttonClasses({ variant, size }), pressed, className)}
    />
  );
}
