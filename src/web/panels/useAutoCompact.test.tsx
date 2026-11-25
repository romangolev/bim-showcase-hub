import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAutoCompact } from './useAutoCompact.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('measures the border box on the first read and on resize', () => {
  let report: ResizeObserverCallback = () => {};
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        report = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const node = document.createElement('div');
  node.getBoundingClientRect = () => ({ width: 570, height: 370 }) as DOMRect;
  const { result } = renderHook(() => useAutoCompact({ current: node }));
  expect(result.current).toBe(false);
  act(() => {
    report(
      [
        {
          contentRect: { width: 530, height: 330 } as DOMRectReadOnly,
          borderBoxSize: [{ inlineSize: 570, blockSize: 370 }],
        } as unknown as ResizeObserverEntry,
      ],
      {} as ResizeObserver,
    );
  });
  expect(result.current).toBe(false);
});
