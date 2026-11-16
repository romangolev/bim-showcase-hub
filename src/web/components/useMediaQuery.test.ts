import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMediaQuery } from './useMediaQuery.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMediaQuery', () => {
  it('subscribes once across re-renders of the same query', () => {
    const add = vi.fn();
    const remove = vi.fn();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        addEventListener: add,
        removeEventListener: remove,
      })),
    );
    const { result, rerender, unmount } = renderHook(() =>
      useMediaQuery('(max-width: 640px)'),
    );
    rerender();
    rerender();
    rerender();
    expect(result.current).toBe(true);
    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
