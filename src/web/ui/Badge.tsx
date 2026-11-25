import { useRender } from '@base-ui/react/use-render';
import { cn } from './cn.js';
import type { CommonProps, Size, Tone } from './types.js';

const base = 'inline-flex min-w-0 items-center gap-1.5 border text-13';

const variants = {
  outline: 'rounded-badge font-label',
  soft: 'rounded-badge border-transparent font-label text-fg',
  plain: 'rounded-badge border-transparent',
  chip: 'rounded-pill border-line text-fg-subtle',
};

const toneText: Record<Tone, string> = {
  neutral: 'text-fg-subtle',
  accent: 'text-accent',
  danger: 'text-danger',
  success: 'text-success',
};

const outlineBorder: Record<Tone, string> = {
  neutral: 'border-line-strong',
  accent: 'border-accent',
  danger: 'border-danger',
  success: 'border-success',
};

const softFill: Record<Tone, string> = {
  neutral: 'bg-fill',
  accent: 'bg-accent-tint',
  danger: 'bg-fill',
  success: 'bg-fill',
};

const sizes: Record<Size, string> = {
  default: 'px-2 py-0.5',
  small: 'gap-1 px-1.5 py-0',
};

type Variant = keyof typeof variants;

function badgeTone(variant: Variant, tone: Tone): string {
  if (variant === 'outline') return cn(toneText[tone], outlineBorder[tone]);
  if (variant === 'soft') return softFill[tone];
  if (variant === 'plain') return toneText[tone];
  return '';
}

export type BadgeProps = Omit<useRender.ComponentProps<'span'>, 'className'> &
  CommonProps & { variant?: Variant; tone?: Tone; size?: Size };

export function Badge({
  className,
  effect,
  variant = 'outline',
  tone = 'neutral',
  size = 'default',
  render,
  ref,
  ...props
}: BadgeProps) {
  return useRender({
    defaultTagName: 'span',
    render,
    ref,
    props: {
      ...props,
      'data-slot': 'badge',
      'data-variant': variant,
      'data-tone': tone,
      'data-size': size,
      'data-effect': effect,
      className: cn(
        base,
        variants[variant],
        badgeTone(variant, tone),
        sizes[size],
        className,
      ),
    },
  });
}
