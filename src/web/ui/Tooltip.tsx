import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { cn } from './cn.js';
import {
  TriggerScope,
  usePopupContainer,
  useTriggerRef,
  useTriggerScopeValue,
} from './topLayer.js';
import type { CommonProps } from './types.js';

export const TooltipProvider = TooltipPrimitive.Provider;

export type TooltipProps = TooltipPrimitive.Root.Props;

export function Tooltip(props: TooltipProps) {
  return (
    <TriggerScope.Provider value={useTriggerScopeValue()}>
      <TooltipPrimitive.Root {...props} />
    </TriggerScope.Provider>
  );
}

export type TooltipTriggerProps = Omit<
  TooltipPrimitive.Trigger.Props,
  'className'
> &
  CommonProps;

export function TooltipTrigger({
  className,
  effect,
  ref,
  ...props
}: TooltipTriggerProps) {
  const triggerRef = useTriggerRef(ref);
  return (
    <TooltipPrimitive.Trigger
      {...props}
      ref={triggerRef}
      data-slot={props.render ? undefined : 'tooltip-trigger'}
      data-effect={effect}
      className={className}
    />
  );
}

export type TooltipPopupProps = Omit<
  TooltipPrimitive.Popup.Props,
  'className'
> &
  CommonProps & {
    container?: HTMLElement | null;
    side?: TooltipPrimitive.Positioner.Props['side'];
    align?: TooltipPrimitive.Positioner.Props['align'];
    sideOffset?: number;
  };

export function TooltipPopup({
  className,
  effect,
  container,
  side = 'bottom',
  align = 'center',
  sideOffset = 6,
  ...props
}: TooltipPopupProps) {
  const host = usePopupContainer(container);
  return (
    <TooltipPrimitive.Portal container={host}>
      <TooltipPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={4}
        positionMethod="fixed"
        data-slot="tooltip-positioner"
        className="z-popup"
      >
        <TooltipPrimitive.Popup
          {...props}
          data-slot="tooltip-popup"
          data-effect={effect}
          className={cn(
            'pointer-events-none rounded-item border border-line bg-surface-raised px-2 py-1 font-sans text-12 text-fg shadow-inset',
            className,
          )}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}
