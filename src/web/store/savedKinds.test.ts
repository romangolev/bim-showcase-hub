import { beforeEach, describe, expect, it } from 'vitest';
import { isRecord } from '../../shared/guards.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { resetSavedKinds } from './savedKindRegistry.js';
import { defineSavedKind } from './savedKinds.js';
import {
  exportSaved,
  importSaved,
  readSaved,
  SAVED,
  type SavedItem,
  upsertSaved,
} from './savedStore.js';

type PresetData = { columns: string[] };

function preset(options: { version?: number; migrate?: boolean } = {}) {
  const migrations: Array<[unknown, number]> = [];
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
    ...(options.migrate === false
      ? {}
      : {
          migrate: (raw: unknown, from: number) => {
            migrations.push([raw, from]);
            const source = isRecord(raw) ? raw : {};
            const columns = Array.isArray(source.columns) ? source.columns : [];
            return { columns: [...columns, 'Level'] };
          },
        }),
  });
  return { handle, migrations };
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
  resetSavedKinds();
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

  it('migrates older stored entries when a handle reads them', () => {
    const { handle, migrations } = preset();
    SAVED.write([oldItem()]);
    expect(handle.list()[0]?.data).toEqual({
      columns: ['Category', 'Level'],
    });
    expect(migrations).toEqual([[{ columns: ['Category'] }, 1]]);
    expect(readSaved()[0]?.version).toBe(1);
  });

  it('upgrades an older entry when it is written again', () => {
    const { handle } = preset();
    expect(upsertSaved(oldItem())).toBe(true);
    expect(readSaved()[0]).toMatchObject({
      version: 2,
      data: { columns: ['Category', 'Level'] },
    });
    expect(handle.list()).toHaveLength(1);
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
    ).toMatchObject({ accepted: 0, rejected: 1, migrated: 0 });
  });

  it('migrates imported entries and reports the count', () => {
    preset();
    const result = importSaved(
      JSON.stringify({
        format: 'bsh-saved',
        version: 2,
        items: [oldItem()],
      }),
    );
    expect(result).toMatchObject({ accepted: 1, migrated: 1, rejected: 0 });
    expect(readSaved()[0]).toMatchObject({
      version: 2,
      data: { columns: ['Category', 'Level'] },
    });
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

  it('rejects an old entry whose kind has no migration path', () => {
    preset({ migrate: false });
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
    expect(importSaved(exportSaved())).toMatchObject({
      accepted: 1,
      migrated: 0,
    });
  });

  it('strips a migration that throws instead of importing the entry', () => {
    defineSavedKind({
      kind: 'broken-kind',
      version: 2,
      label: 'Broken',
      sanitize: (raw) => (isRecord(raw) ? raw : null),
      migrate: () => {
        throw new Error('no');
      },
    });
    expect(
      upsertSaved({
        id: 'b',
        kind: 'broken-kind',
        name: 'B',
        version: 1,
        updatedAt: 1,
        data: {},
      }),
    ).toBe(false);
  });
});
