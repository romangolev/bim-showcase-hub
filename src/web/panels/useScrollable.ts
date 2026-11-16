import { type RefObject, useEffect, useState } from 'react';

export function useScrollable(ref: RefObject<HTMLElement | null>): boolean {
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const measure = () => {
      setScrollable(
        node.scrollHeight > node.clientHeight + 1 ||
          node.scrollWidth > node.clientWidth + 1,
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const table = node.firstElementChild;
    if (table) {
      observer.observe(table);
    }
    return () => observer.disconnect();
  }, [ref]);

  return scrollable;
}
