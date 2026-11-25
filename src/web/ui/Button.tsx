import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cn } from './cn.js';

const base =
  'inline-flex min-h-hit cursor-pointer items-center justify-center gap-2 rounded-control border px-3 font-ui text-14 tracking-body transition-colors motion-reduce:transition-none data-disabled:cursor-not-allowed';

const variants = {
  default:
    'border-line bg-fill text-fg not-data-disabled:hover:bg-fill-hover not-data-disabled:active:bg-fill-active data-disabled:text-fg-disabled',
  primary:
    'border-transparent bg-solid text-on-solid shadow-control not-data-disabled:hover:bg-solid-hover data-disabled:opacity-60',
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
