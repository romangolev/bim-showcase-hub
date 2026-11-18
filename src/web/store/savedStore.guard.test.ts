import { beforeEach, describe, expect, it } from 'vitest';
import { getStorageAdapter } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import {
  importSaved,
  moveSaved,
  readSaved,
  removeSaved,
  renameSaved,
  SAVED_KEY,
  SAVED_VERSION,
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

function storeFromNewerBuild() {
  const text = JSON.stringify({
    version: SAVED_VERSION + 1,
    items: [item('a'), item('b')],
    extra: true,
  });
  getStorageAdapter().set('local', SAVED_KEY, text);
  return text;
}

describe('saved store written by a newer build', () => {
  it('reads but refuses every write and leaves the stored text untouched', () => {
    const text = storeFromNewerBuild();
    expect(readSaved().map((i) => i.id)).toEqual(['a', 'b']);
    expect(upsertSaved(item('c'))).toBe(false);
    expect(upsertSaved(item('a', { name: 'x' }))).toBe(false);
    expect(renameSaved('summary-preset', 'a', 'Renamed')).toBe(false);
    expect(removeSaved('a')).toBe(false);
    expect(moveSaved('a', 1)).toBe(false);
    const result = importSaved(
      JSON.stringify({ format: 'bsh-saved', version: 1, items: [item('z')] }),
    );
    expect(result.error).toBeTruthy();
    expect(result.accepted).toBe(0);
    expect(getStorageAdapter().get('local', SAVED_KEY)).toBe(text);
  });
});

describe('saved store id clashes across kinds', () => {
  it('rejects an upsert whose id exists under another kind', () => {
    upsertSaved(item('a', { kind: 'viewpoint' }));
    expect(upsertSaved(item('a', { kind: 'selection-set' }))).toBe(false);
    expect(readSaved()).toHaveLength(1);
    expect(readSaved()[0]?.kind).toBe('viewpoint');
  });

  it('counts an imported item that clashes with another kind as rejected', () => {
    upsertSaved(item('a', { kind: 'viewpoint', updatedAt: 1 }));
    const result = importSaved(
      JSON.stringify({
        format: 'bsh-saved',
        version: 1,
        items: [
          item('a', { kind: 'selection-set', updatedAt: 9 }),
          item('b', { kind: 'selection-set' }),
        ],
      }),
    );
    expect(result).toMatchObject({ accepted: 1, rejected: 1 });
    expect(readSaved().find((i) => i.id === 'a')?.kind).toBe('viewpoint');
    expect(readSaved().map((i) => i.id)).toEqual(['a', 'b']);
  });
});
