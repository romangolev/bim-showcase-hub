import { beforeEach, describe, expect, it } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import {
  clearSaved,
  getSaved,
  MAX_TOTAL_BYTES,
  readSaved,
  SAVED,
  type SavedItem,
  savedBytes,
  savedStore,
  upsertSaved,
} from './savedStore.js';

const item = (id: string, over: Partial<SavedItem> = {}): SavedItem => ({
  id,
  kind: 'viewpoint',
  name: id.toUpperCase(),
  version: 1,
  updatedAt: 1,
  data: { a: 1 },
  ...over,
});

beforeEach(() => {
  installMemoryStorage();
});

describe('saved store budget and facade', () => {
  it('refuses a write that would exceed the browser budget', () => {
    const blob = 'x'.repeat(95_000);
    const items = Array.from({ length: 45 }, (_, index) =>
      item(`b${index}`, { data: { blob } }),
    );
    SAVED.write(items);
    expect(savedBytes()).toBeGreaterThan(MAX_TOTAL_BYTES);
    expect(upsertSaved(item('tiny'))).toBe(false);
    expect(readSaved()).toHaveLength(45);
  });

  it('exposes the store through one interface and clears it', () => {
    expect(upsertSaved(item('a'))).toBe(true);
    expect(savedBytes()).toBeLessThan(MAX_TOTAL_BYTES);
    expect(getSaved('a')?.name).toBe('A');
    expect(savedStore.get('gone')).toBeUndefined();
    expect(savedStore.list('viewpoint').map((entry) => entry.id)).toEqual([
      'a',
    ]);
    expect(savedStore.put(item('b'))).toBe(true);
    expect(savedStore.rename('viewpoint', 'b', 'B renamed')).toBe(true);
    expect(savedStore.get('b')?.name).toBe('B renamed');
    expect(savedStore.move('b', -1)).toBe(true);
    expect(savedStore.list().map((entry) => entry.id)).toEqual(['b', 'a']);
    expect(savedStore.remove('b')).toBe(true);
    expect(clearSaved()).toBe(true);
    expect(readSaved()).toEqual([]);
  });
});
