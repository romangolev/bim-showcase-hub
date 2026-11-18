import { beforeEach, describe, expect, it } from 'vitest';
import { forgetPersonal } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import {
  exportSaved,
  importSaved,
  MAX_IMPORT_BYTES,
  readSaved,
  removeSaved,
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

  it('strips prototype pollution keys', () => {
    const text =
      '{"format":"bsh-saved","version":1,"items":[{"id":"p","kind":"viewpoint","name":"P","data":{"__proto__":{"polluted":true},"ok":{"constructor":1,"y":2}}}]}';
    importSaved(text);
    const [saved] = readSaved();
    expect(Object.keys(saved?.data ?? {})).toEqual(['ok']);
    expect(saved?.data.ok).toEqual({ y: 2 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('is cleared on sign-out', () => {
    upsertSaved(item('a'));
    forgetPersonal();
    expect(readSaved()).toEqual([]);
  });
});
