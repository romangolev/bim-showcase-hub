import { beforeEach, describe, expect, it } from 'vitest';
import { isRecord } from '../../shared/guards.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { unregisterSavedKind } from './savedKindRegistry.js';
import { defineSavedKind } from './savedKinds.js';
import {
  exportSaved,
  importSaved,
  readSaved,
  type SavedItem,
  upsertSaved,
} from './savedStore.js';

type PresetData = { columns: string[] };

function preset(options: { version?: number } = {}) {
  const handle = defineSavedKind<PresetData>({
    kind: 'summary-preset',
    version: options.version ?? 2,
    label: 'Summary preset',
    sanitize: (raw) => {
      if (!isRecord(raw) || !Array.isArray(raw.columns)) return null;
      const columns = raw.columns.filter(
        (column): column is string => typeof column === 'string',
      );
      return columns.length > 0 ? { columns } : null;
    },
  });
  return { handle };
}

function oldItem(over: Partial<SavedItem> = {}): SavedItem {
  return {
    id: 'old',
    kind: 'summary-preset',
    name: 'Old preset',
    version: 1,
    updatedAt: 1,
    data: { columns: ['Category'] },
    ...over,
  };
}

beforeEach(() => {
  installMemoryStorage();
  unregisterSavedKind('summary-preset');
});

describe('typed saved kinds', () => {
  it('saves, lists, updates, renames, moves and removes typed items', () => {
    const { handle } = preset();
    const first = handle.save('Mine', { columns: ['Category'] });
    const second = handle.save('Other', { columns: ['Level'] });
    expect(first).toMatchObject({
      name: 'Mine',
      version: 2,
    });
    expect(handle.list().map((item) => item.name)).toEqual(['Mine', 'Other']);
    expect(handle.get(first?.id ?? '')?.data).toEqual({
      columns: ['Category'],
    });
    expect(
      handle.save('Mine renamed', first?.data ?? { columns: [] }, first?.id),
    ).not.toBeNull();
    expect(handle.list()).toHaveLength(2);
    expect(handle.rename(second?.id ?? '', '  Other renamed  ')).toBe(true);
    expect(handle.list()[1]?.name).toBe('Other renamed');
    expect(handle.move(second?.id ?? '', -1)).toBe(true);
    expect(handle.list()[0]?.name).toBe('Other renamed');
    expect(handle.remove(second?.id ?? '')).toBe(true);
    expect(handle.list().map((item) => item.name)).toEqual(['Mine renamed']);
  });

  it('refuses data the kind does not accept', () => {
    const { handle } = preset();
    expect(handle.save('Empty', { columns: [] })).toBeNull();
    expect(handle.save('   ', { columns: ['Category'] })).toBeNull();
    expect(handle.save('Fine', { columns: ['Category'] })).not.toBeNull();
  });

  it('does not let a handle remove an item of another kind', () => {
    const { handle } = preset();
    upsertSaved({
      id: 'other',
      kind: 'viewpoint',
      name: 'View',
      version: 1,
      updatedAt: 1,
      data: {},
    });
    expect(handle.remove('other')).toBe(false);
    expect(readSaved()).toHaveLength(1);
  });

  it('accepts the same kind being defined twice at the same version', () => {
    const first = preset();
    const again = defineSavedKind<PresetData>({
      kind: 'summary-preset',
      version: 2,
      label: 'Summary preset',
      sanitize: (raw) =>
        isRecord(raw) && Array.isArray(raw.columns)
          ? {
              columns: raw.columns.filter(
                (c): c is string => typeof c === 'string',
              ),
            }
          : null,
    });
    expect(again.version).toBe(2);
    expect(again.save('Mine', { columns: ['Category'] })).not.toBeNull();
    expect(first.handle.list()).toHaveLength(1);
    expect(again.save('Empty', { columns: [] })).not.toBeNull();
    expect(first.handle.list()).toHaveLength(2);
  });

  it('refuses to redefine a kind at a different version', () => {
    preset();
    expect(() =>
      defineSavedKind({
        kind: 'summary-preset',
        version: 3,
        label: 'Summary preset',
        sanitize: (raw) => (isRecord(raw) ? raw : null),
      }),
    ).toThrow(/already registered at version 2/);
  });

  it('refuses a registered kind entry that is newer than the spec', () => {
    preset();
    expect(upsertSaved(oldItem({ version: 3 }))).toBe(false);
    expect(
      importSaved(
        JSON.stringify({
          format: 'bsh-saved',
          version: 2,
          items: [oldItem({ version: 3 })],
        }),
      ),
    ).toMatchObject({ accepted: 0, rejected: 1 });
  });

  it('exports the current version of every registered kind', () => {
    preset();
    defineSavedKind({
      kind: 'colour-rule',
      version: 4,
      label: 'Colour rule',
      sanitize: (raw) => (isRecord(raw) ? raw : null),
    });
    const file = JSON.parse(exportSaved()) as {
      version: number;
      kinds: Record<string, number>;
    };
    expect(file.version).toBe(2);
    expect(file.kinds).toEqual({ 'colour-rule': 4, 'summary-preset': 2 });
  });

  it('rejects an entry older than the registered kind', () => {
    preset();
    expect(upsertSaved(oldItem())).toBe(false);
  });

  it('keeps unknown kinds as they are for forward compatibility', () => {
    const item: SavedItem = {
      id: 'future',
      kind: 'future-thing',
      name: 'Later',
      version: 7,
      updatedAt: 1,
      data: { anything: true },
    };
    expect(upsertSaved(item)).toBe(true);
    expect(importSaved(exportSaved())).toMatchObject({ accepted: 1 });
  });
});
