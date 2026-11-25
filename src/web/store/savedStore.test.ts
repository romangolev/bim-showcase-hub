import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetPersonal, getStorageAdapter } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import {
  exportSaved,
  importSaved,
  MAX_IMPORT_BYTES,
  MAX_ITEM_BYTES,
  MAX_ITEMS,
  MAX_NAME_LENGTH,
  readSaved,
  removeSaved,
  renameSaved,
  SAVED,
  SAVED_KEY,
  type SavedItem,
  upsertSaved,
} from './savedStore.js';

const item = (id: string, over: Partial<SavedItem> = {}): SavedItem => ({
  id,
  kind: 'summary-preset',
  name: `Preset ${id}`,
  version: 1,
  updatedAt: 1,
  data: { columns: ['a'] },
  ...over,
});

beforeEach(() => {
  installMemoryStorage();
});

describe('saved store', () => {
  it('upserts, filters by kind and removes', () => {
    expect(upsertSaved(item('a'))).toBe(true);
    expect(upsertSaved(item('b', { kind: 'viewpoint' }))).toBe(true);
    expect(upsertSaved(item('a', { name: 'Renamed' }))).toBe(true);
    expect(readSaved()).toHaveLength(2);
    expect(readSaved('viewpoint').map((i) => i.id)).toEqual(['b']);
    expect(readSaved('summary-preset')[0]?.name).toBe('Renamed');
    removeSaved('a');
    expect(readSaved().map((i) => i.id)).toEqual(['b']);
  });

  it('rejects malformed items', () => {
    expect(upsertSaved(item('a', { kind: 'Bad Kind' }))).toBe(false);
    expect(upsertSaved(item('a', { name: '  ' }))).toBe(false);
    expect(upsertSaved(item('a', { data: { x: 'y'.repeat(200_000) } }))).toBe(
      false,
    );
    expect(readSaved()).toEqual([]);
  });

  it('round-trips through export and import', () => {
    upsertSaved(item('a'));
    const text = exportSaved();
    window.localStorage.clear();
    const result = importSaved(text);
    expect(result).toMatchObject({ accepted: 1, rejected: 0 });
    expect(readSaved()).toHaveLength(1);
  });

  it('validates imports', () => {
    expect(importSaved('{').error).toBeTruthy();
    expect(importSaved('x'.repeat(MAX_IMPORT_BYTES + 1)).error).toBeTruthy();
    expect(importSaved('{"format":"other","items":[]}').error).toBeTruthy();
    expect(
      importSaved('{"format":"bsh-saved","version":99,"items":[]}').error,
    ).toBeTruthy();
    const mixed = JSON.stringify({
      format: 'bsh-saved',
      version: 1,
      items: [item('ok'), { id: 'bad' }, item('ok')],
    });
    expect(importSaved(mixed)).toMatchObject({ accepted: 1, rejected: 2 });
  });

  it('keeps stored items above the cap through a read, a rename and a delete', () => {
    const stored = Array.from({ length: MAX_ITEMS + 20 }, (_, i) =>
      item(`s${i}`),
    );
    SAVED.write(stored);
    expect(readSaved()).toHaveLength(MAX_ITEMS + 20);
    expect(upsertSaved(item('s3', { name: 'Renamed' }))).toBe(true);
    expect(readSaved()).toHaveLength(MAX_ITEMS + 20);
    expect(removeSaved('s0')).toBe(true);
    expect(readSaved()).toHaveLength(MAX_ITEMS + 19);
    expect(upsertSaved(item('new'))).toBe(false);
  });

  it('caches the sanitized list and drops it on write, remove, forget and external change', () => {
    upsertSaved(item('a'));
    const first = SAVED.read();
    expect(SAVED.read()).toBe(first);
    upsertSaved(item('b'));
    const second = SAVED.read();
    expect(second).not.toBe(first);
    expect(second).toHaveLength(2);
    removeSaved('a');
    expect(SAVED.read().map((i) => i.id)).toEqual(['b']);
    getStorageAdapter().set(
      'local',
      SAVED_KEY,
      JSON.stringify({ version: 1, items: [item('x'), item('y')] }),
    );
    expect(SAVED.read().map((i) => i.id)).toEqual(['x', 'y']);
    forgetPersonal();
    expect(SAVED.read()).toEqual([]);
  });

  it('rejects an oversized item on write and import, not on read', () => {
    const big = item('big', { data: { blob: 'x'.repeat(MAX_ITEM_BYTES) } });
    expect(upsertSaved(big)).toBe(false);
    const result = importSaved(
      JSON.stringify({ format: 'bsh-saved', version: 1, items: [big] }),
    );
    expect(result.accepted).toBe(0);
    SAVED.write([big]);
    expect(readSaved()).toHaveLength(1);
  });

  it('renames with the shared name rules', () => {
    upsertSaved(item('a', { kind: 'viewpoint' }));
    expect(renameSaved('viewpoint', 'a', `  ${'n'.repeat(120)}  `)).toBe(true);
    expect(readSaved()[0]?.name).toHaveLength(MAX_NAME_LENGTH);
    expect(renameSaved('viewpoint', 'a', '   ')).toBe(false);
    expect(renameSaved('selection-set', 'a', 'x')).toBe(false);
    expect(renameSaved('viewpoint', 'gone', 'x')).toBe(false);
  });

  it('treats deleting a missing id as a no-op that does not write', () => {
    upsertSaved(item('a'));
    const adapter = getStorageAdapter();
    const set = vi.spyOn(adapter, 'set');
    expect(removeSaved('gone')).toBe(true);
    expect(set).not.toHaveBeenCalled();
  });

  it('reports what the cap dropped instead of claiming it accepted', () => {
    for (let i = 0; i < MAX_ITEMS - 10; i++) upsertSaved(item(`s${i}`));
    const text = JSON.stringify({
      format: 'bsh-saved',
      version: 1,
      items: Array.from({ length: 50 }, (_, i) => item(`n${i}`)),
    });
    const result = importSaved(text);
    expect(result).toMatchObject({ accepted: 10, dropped: 40, older: 0 });
    expect(result.items).toHaveLength(MAX_ITEMS);
    expect(readSaved()).toHaveLength(MAX_ITEMS);
  });

  it('keeps the newer item when ids collide', () => {
    upsertSaved(item('a', { name: 'Stored', updatedAt: 10 }));
    upsertSaved(item('b', { name: 'Stored B', updatedAt: 1 }));
    const text = JSON.stringify({
      format: 'bsh-saved',
      version: 1,
      items: [
        item('a', { name: 'Older', updatedAt: 5 }),
        item('b', { name: 'Newer', updatedAt: 9 }),
      ],
    });
    expect(importSaved(text)).toMatchObject({ accepted: 1, older: 1 });
    const names = Object.fromEntries(readSaved().map((i) => [i.id, i.name]));
    expect(names).toEqual({ a: 'Stored', b: 'Newer' });
  });

  it('fails cleanly on data nested too deep to sanitize', () => {
    const depth = 20_000;
    const nested = `${'{"a":'.repeat(depth)}1${'}'.repeat(depth)}`;
    const text = `{"format":"bsh-saved","version":1,"items":[{"id":"d","kind":"viewpoint","name":"D","data":${nested}}]}`;
    expect(text.length).toBeLessThan(MAX_IMPORT_BYTES);
    expect(importSaved(text)).toMatchObject({
      accepted: 0,
      error: 'Not a saved-items file.',
    });
    expect(readSaved()).toEqual([]);
  });

  it('strips prototype pollution keys', () => {
    const text =
      '{"format":"bsh-saved","version":1,"items":[{"id":"p","kind":"viewpoint","name":"P","data":{"__proto__":{"polluted":true},"ok":{"constructor":1,"y":2}}}]}';
    importSaved(text);
    const [saved] = readSaved();
    expect(Object.keys(saved?.data ?? {})).toEqual(['ok']);
    expect(saved?.data.ok).toEqual({ y: 2 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('drops saved combinations from storage and from imported files', () => {
    const combination = item('federation-1', {
      kind: 'federation',
      name: 'Combination 1',
      data: { members: [{ urn: 'a' }, { urn: 'b' }] },
    });
    getStorageAdapter().set(
      'local',
      SAVED_KEY,
      JSON.stringify({ version: 2, items: [combination, item('a')] }),
    );
    expect(readSaved().map((i) => i.id)).toEqual(['a']);
    expect(upsertSaved(combination)).toBe(false);
    const result = importSaved(
      JSON.stringify({
        format: 'bsh-saved',
        version: 2,
        items: [item('federation-2', { kind: 'federation' }), item('b')],
      }),
    );
    expect(result.error).toBeUndefined();
    expect(result.accepted).toBe(1);
    expect(readSaved().map((i) => i.id)).toEqual(['a', 'b']);
    expect(getStorageAdapter().get('local', SAVED_KEY)).not.toContain(
      'federation',
    );
  });

  it('is cleared on sign-out', () => {
    upsertSaved(item('a'));
    forgetPersonal();
    expect(readSaved()).toEqual([]);
  });
});
