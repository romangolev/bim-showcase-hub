import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cn } from './cn.js';
import type { CommonProps, Size, Tone } from './types.js';

const base =
  'inline-flex min-h-hit cursor-pointer items-center justify-center gap-2 rounded-control border px-3 font-ui text-14 tracking-body transition-colors motion-reduce:transition-none data-disabled:cursor-not-allowed data-loading:cursor-progress';

const variants = {
  default:
    'border-line bg-fill text-fg not-data-disabled:hover:bg-fill-hover not-data-disabled:active:bg-fill-active data-disabled:text-fg-disabled',
  primary:
    'border-transparent bg-solid text-on-solid shadow-control not-data-disabled:hover:bg-solid-hover data-disabled:opacity-60',
  ghost:
    'border-transparent bg-transparent text-fg not-data-disabled:hover:bg-fill not-data-disabled:active:bg-fill-active data-disabled:text-fg-disabled',
};

const sizes: Record<Size, string> = {
  default: '',
  small: 'gap-1 px-2 text-13',
};

const tones: Record<Tone, string> = {
  neutral: '',
  accent: 'not-data-disabled:text-accent',
  danger: 'not-data-disabled:text-danger',
  success: 'not-data-disabled:text-success',
};

export interface ButtonStyleProps {
  variant?: keyof typeof variants;
  size?: Size;
  tone?: Tone;
}

export function buttonClasses({
  variant = 'default',
  size = 'default',
  tone = 'neutral',
}: ButtonStyleProps): string {
  return cn(
    base,
    variants[variant],
    sizes[size],
    variant === 'primary' ? '' : tones[tone],
  );
}

export type ButtonProps = Omit<ButtonPrimitive.Props, 'className'> &
  CommonProps &
  ButtonStyleProps & { loading?: boolean };

export function Button({
  className,
  effect,
  variant = 'default',
  size = 'default',
  tone = 'neutral',
  loading = false,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      {...props}
      disabled={disabled || loading}
      focusableWhenDisabled={loading || props.focusableWhenDisabled}
      aria-busy={loading || undefined}
      data-loading={loading ? '' : undefined}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-tone={tone}
      data-effect={effect}
      className={cn(buttonClasses({ variant, size, tone }), className)}
    />
  );
}
