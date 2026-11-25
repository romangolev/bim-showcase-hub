import type { KeyboardEvent } from 'react';

export function moveFocus(
  event: KeyboardEvent,
  list: HTMLElement[],
  index = list.indexOf(document.activeElement as HTMLElement),
) {
  const to =
    event.key === 'ArrowDown'
      ? index + 1
      : event.key === 'ArrowUp'
        ? index - 1
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? list.length - 1
            : null;
  if (to === null) return false;
  event.preventDefault();
  list[(to + list.length) % list.length]?.focus();
  return true;
}
