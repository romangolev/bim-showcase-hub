import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cn } from './cn.js';

const base =
  'inline-flex min-h-hit cursor-pointer items-center justify-center gap-2 rounded-button border px-3 font-ui text-14 tracking-body transition-colors motion-reduce:transition-none data-disabled:cursor-not-allowed';

const variants = {
  default:
    'border-hairline bg-ghost-fill text-snow not-data-disabled:hover:bg-ghost-fill-hover not-data-disabled:active:bg-ghost-fill-active data-disabled:text-ash',
  primary:
    'border-transparent bg-bone text-ink shadow-button not-data-disabled:hover:bg-snow data-disabled:opacity-60',
};

const sizes = {
  default: '',
  small: 'gap-1 px-2 text-13',
};

export type ButtonProps = ButtonPrimitive.Props & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

export function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}
