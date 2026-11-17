import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
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
});
