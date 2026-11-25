import {
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

const GAP = 4;

export interface PopoverPosition {
  top: number;
  left: number;
}

interface PopoverOptions {
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  popoverRef: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  align?: 'start' | 'end';
  anchor?: { x: number; y: number };
}

export function useOutsidePointer(
  open: boolean,
  refs: RefObject<HTMLElement | null>[],
  onDismiss: () => void,
  place?: () => void,
) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const refsRef = useRef(refs);
  refsRef.current = refs;
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!refsRef.current.some((ref) => ref.current?.contains(target))) {
        dismissRef.current();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    if (place) {
      window.addEventListener('resize', place);
      document.addEventListener('scroll', place, true);
    }
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      if (place) {
        window.removeEventListener('resize', place);
        document.removeEventListener('scroll', place, true);
      }
    };
  }, [open, place]);
}

export function usePopover({
  open,
  triggerRef,
  popoverRef,
  onDismiss,
  align = 'end',
  anchor,
}: PopoverOptions) {
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const anchorX = anchor?.x;
  const anchorY = anchor?.y;
  const place = useCallback(() => {
    const rect =
      anchorX !== undefined && anchorY !== undefined
        ? { left: anchorX, right: anchorX, top: anchorY, bottom: anchorY }
        : triggerRef.current?.getBoundingClientRect();
    const box = popoverRef.current;
    if (!rect || !box) return;
    const width = box.offsetWidth;
    const height = box.offsetHeight;
    const left = Math.max(
      GAP,
      Math.min(
        anchorX !== undefined || align === 'start'
          ? rect.left
          : rect.right - width,
        window.innerWidth - width - GAP,
      ),
    );
    const below = rect.bottom + (anchorX !== undefined ? 0 : GAP);
    const top =
      below + height > window.innerHeight
        ? Math.max(GAP, rect.top - height - GAP)
        : below;
    setPosition({ top, left });
  }, [align, anchorX, anchorY, triggerRef, popoverRef]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    place();
  }, [open, place]);

  useOutsidePointer(open, [triggerRef, popoverRef], onDismiss, place);

  return position;
}

export function onEscape(event: KeyboardEvent, close: () => void) {
  if (event.key !== 'Escape') return false;
  event.preventDefault();
  event.stopPropagation();
  close();
  return true;
}
