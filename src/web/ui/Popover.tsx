import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { cn } from './cn.js';
import {
  TriggerScope,
  usePopupContainer,
  useTriggerRef,
  useTriggerScopeValue,
} from './topLayer.js';
import type { CommonProps } from './types.js';

export type PopoverProps = PopoverPrimitive.Root.Props;

export function Popover(props: PopoverProps) {
  return (
    <TriggerScope.Provider value={useTriggerScopeValue()}>
      <PopoverPrimitive.Root {...props} />
    </TriggerScope.Provider>
  );
}

export type PopoverTriggerProps = Omit<
  PopoverPrimitive.Trigger.Props,
  'className'
> &
  CommonProps;

export function PopoverTrigger({
  className,
  effect,
  ref,
  ...props
}: PopoverTriggerProps) {
  const triggerRef = useTriggerRef(ref);
  return (
    <PopoverPrimitive.Trigger
      {...props}
      ref={triggerRef}
      data-slot={props.render ? undefined : 'popover-trigger'}
      data-effect={effect}
      className={className}
    />
  );
}

const popup =
  'z-popup max-h-(--available-height) overflow-y-auto rounded-surface border border-line bg-surface p-3 font-sans text-13 text-fg-muted shadow-inset outline-none';

export type PopoverPopupProps = Omit<
  PopoverPrimitive.Popup.Props,
  'className'
> &
  CommonProps & {
    container?: HTMLElement | null;
    anchor?: PopoverPrimitive.Positioner.Props['anchor'];
    side?: PopoverPrimitive.Positioner.Props['side'];
    align?: PopoverPrimitive.Positioner.Props['align'];
    sideOffset?: number;
  };

export function PopoverPopup({
  className,
  effect,
  container,
  anchor,
  side = 'bottom',
  align = 'end',
  sideOffset = 4,
  ...props
}: PopoverPopupProps) {
  const host = usePopupContainer(container);
  return (
    <PopoverPrimitive.Portal container={host}>
      <PopoverPrimitive.Positioner
        anchor={anchor}
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={4}
        positionMethod="fixed"
        data-slot="popover-positioner"
        className="z-popup"
      >
        <PopoverPrimitive.Popup
          {...props}
          data-slot="popover-popup"
          data-effect={effect}
          className={cn(popup, className)}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export type PopoverTitleProps = Omit<
  PopoverPrimitive.Title.Props,
  'className'
> &
  CommonProps;

export function PopoverTitle({
  className,
  effect,
  ...props
}: PopoverTitleProps) {
  return (
    <PopoverPrimitive.Title
      {...props}
      data-slot="popover-title"
      data-effect={effect}
      className={cn('m-0 text-13 font-label text-fg', className)}
    />
  );
}

export const PopoverClose = PopoverPrimitive.Close;
