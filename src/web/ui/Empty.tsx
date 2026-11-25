import { useRender } from '@base-ui/react/use-render';
import { type ComponentProps, createContext, useContext } from 'react';
import { cn } from './cn.js';
import type { CommonProps, Size } from './types.js';

type EmptyTone = 'neutral' | 'danger';

const ToneContext = createContext<EmptyTone>('neutral');

const sizes: Record<Size, string> = {
  default: 'gap-3 py-4',
  small: 'gap-2 py-1',
};

type PartProps<T extends 'div' | 'span' | 'p'> = Omit<
  ComponentProps<T>,
  'className'
> &
  CommonProps;

export type EmptyProps = PartProps<'div'> & { tone?: EmptyTone; size?: Size };

export function Empty({
  className,
  effect,
  tone = 'neutral',
  size = 'default',
  ...props
}: EmptyProps) {
  return (
    <ToneContext.Provider value={tone}>
      <div
        {...props}
        data-slot="empty"
        data-tone={tone}
        data-size={size}
        data-effect={effect}
        className={cn(
          'flex min-w-0 items-start text-13 text-fg-muted',
          sizes[size],
          className,
        )}
      />
    </ToneContext.Provider>
  );
}

export function EmptyMedia({ className, effect, ...props }: PartProps<'span'>) {
  const tone = useContext(ToneContext);
  return (
    <span
      {...props}
      data-slot="empty-media"
      data-effect={effect}
      className={cn(
        'mt-px inline-flex flex-none items-center justify-center',
        tone === 'danger' ? 'text-danger' : 'text-fg-subtle',
        className,
      )}
    />
  );
}

export function EmptyContent({
  className,
  effect,
  ...props
}: PartProps<'div'>) {
  return (
    <div
      {...props}
      data-slot="empty-content"
      data-effect={effect}
      className={cn('flex min-w-0 flex-1 flex-col gap-0.5', className)}
    />
  );
}

export type EmptyTitleProps = Omit<useRender.ComponentProps<'p'>, 'className'> &
  CommonProps;

export function EmptyTitle({
  className,
  effect,
  render,
  ref,
  ...props
}: EmptyTitleProps) {
  return useRender({
    defaultTagName: 'p',
    render,
    ref,
    props: {
      ...props,
      'data-slot': 'empty-title',
      'data-effect': effect,
      className: cn('m-0 text-14 font-ui text-fg', className),
    },
  });
}

export function EmptyDescription({
  className,
  effect,
  ...props
}: PartProps<'p'>) {
  const tone = useContext(ToneContext);
  return (
    <p
      {...props}
      data-slot="empty-description"
      data-effect={effect}
      className={cn(
        'm-0 wrap-anywhere',
        tone === 'danger' ? 'text-danger' : 'text-fg-disabled',
        className,
      )}
    />
  );
}
