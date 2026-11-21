import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setStorageAdapter } from '../storage.js';
import { memoryAdapter, type StorageAdapter } from '../storageAdapter.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { LAYOUT_WRITE_DELAY_MS, useDebouncedWrite } from './LayoutProvider.js';
import { defaultModel, LAYOUT_KEY, parseLayout } from './layoutState.js';

let previous: StorageAdapter;
let adapter: StorageAdapter;

beforeEach(() => {
  installMemoryStorage();
  adapter = memoryAdapter();
  previous = setStorageAdapter(adapter);
});

afterEach(() => {
  setStorageAdapter(previous);
  vi.useRealTimers();
});

describe('layout storage', () => {
  it('writes the layout through the storage adapter', () => {
    vi.useFakeTimers();
    const { rerender } = renderHook(({ model }) => useDebouncedWrite(model), {
      initialProps: { model: defaultModel() },
    });
    rerender({ model: { ...defaultModel(), treeWidth: 321 } });
    act(() => {
      vi.advanceTimersByTime(LAYOUT_WRITE_DELAY_MS * 2);
    });
    expect(parseLayout(adapter.get('local', LAYOUT_KEY))?.treeWidth).toBe(321);
    expect(window.localStorage.getItem(LAYOUT_KEY)).toBeNull();
  });
});
