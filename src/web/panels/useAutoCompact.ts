import { type RefObject, useLayoutEffect, useState } from 'react';

export const COMPACT_BELOW = { width: 560, height: 360 };
export const ROOMY_FROM = { width: 600, height: 400 };

export function nextCompact(
  compact: boolean,
  width: number,
  height: number,
): boolean {
  if (width <= 0 || height <= 0) return compact;
  const limit = compact ? ROOMY_FROM : COMPACT_BELOW;
  return width < limit.width || height < limit.height;
}

export function useAutoCompact(ref: RefObject<HTMLElement | null>): boolean {
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = (width: number, height: number) =>
      setCompact((prev) => nextCompact(prev, width, height));
    const box = node.getBoundingClientRect();
    measure(box.width, box.height);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.borderBoxSize?.[0];
      if (box) measure(box.inlineSize, box.blockSize);
    });
    observer.observe(node, { box: 'border-box' });
    return () => observer.disconnect();
  }, [ref]);

  return compact;
}
