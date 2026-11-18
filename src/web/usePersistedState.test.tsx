import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from './test/mockApi.js';
import { usePersistedState } from './usePersistedState.js';

const sanitize = (raw: unknown) => (typeof raw === 'number' ? raw : 0);

beforeEach(() => {
  installMemoryStorage();
});

describe('usePersistedState', () => {
  it('picks up a change written by another tab', () => {
    const view = renderHook(() => usePersistedState('k', 1, sanitize));
    expect(view.result.current[0]).toBe(1);
    act(() => {
      window.localStorage.setItem('k', '7');
      window.dispatchEvent(new StorageEvent('storage', { key: 'k' }));
    });
    expect(view.result.current[0]).toBe(7);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'other' }));
    });
    expect(view.result.current[0]).toBe(7);
  });

  it('syncs two instances even when storage rejects the write', async () => {
    const a = renderHook(() => usePersistedState('k', 1, sanitize));
    const b = renderHook(() => usePersistedState('k', 1, sanitize));
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await act(async () => {
      a.result.current[1](5);
      await Promise.resolve();
    });
    expect(a.result.current[0]).toBe(5);
    expect(b.result.current[0]).toBe(5);
    vi.restoreAllMocks();
  });

  it('applies consecutive functional updates exactly once each', () => {
    const view = renderHook(() => usePersistedState('k', 1, sanitize));
    const updater = vi.fn((n: number) => n + 1);
    act(() => {
      view.result.current[1](updater);
      view.result.current[1](updater);
    });
    expect(view.result.current[0]).toBe(3);
    expect(updater).toHaveBeenCalledTimes(2);
    expect(window.localStorage.getItem('k')).toBe('3');
  });
});
