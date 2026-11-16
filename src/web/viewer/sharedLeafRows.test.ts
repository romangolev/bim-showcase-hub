import { describe, expect, it, vi } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import { readLeafRows } from './sharedLeafRows.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

function fakeAdapter() {
  const getLeafProperties = vi.fn(async (names: string[]) => {
    const row: PropertyRow = {
      dbId: 1,
      name: 'El',
      properties: Object.fromEntries(names.map((n) => [n, `${n}-v`])),
    };
    return [row];
  });
  return {
    adapter: { getLeafProperties } as unknown as ViewerAdapter,
    getLeafProperties,
  };
}

describe('readLeafRows', () => {
  it('merges same-tick reads into one bulk read of the union', async () => {
    const { adapter, getLeafProperties } = fakeAdapter();
    const [dashboard, summary, exported] = await Promise.all([
      readLeafRows(adapter, ['Category', 'Level', 'Name']),
      readLeafRows(adapter, ['Name', 'Assembly Code']),
      readLeafRows(adapter, ['Level', 'Category']),
    ]);
    expect(getLeafProperties).toHaveBeenCalledTimes(1);
    expect(new Set(getLeafProperties.mock.calls[0]?.[0])).toEqual(
      new Set(['Category', 'Level', 'Name', 'Assembly Code']),
    );
    expect(Object.keys(dashboard[0]?.properties ?? {})).toEqual([
      'Category',
      'Level',
      'Name',
    ]);
    expect(Object.keys(summary[0]?.properties ?? {})).toEqual([
      'Name',
      'Assembly Code',
    ]);
    expect(Object.keys(exported[0]?.properties ?? {})).toEqual([
      'Level',
      'Category',
    ]);
  });

  it('reads again once the previous read has finished', async () => {
    const { adapter, getLeafProperties } = fakeAdapter();
    await readLeafRows(adapter, ['Name']);
    await readLeafRows(adapter, ['Name']);
    expect(getLeafProperties).toHaveBeenCalledTimes(2);
  });

  it('shares an in-flight read with a covered request', async () => {
    let release: (rows: PropertyRow[]) => void = () => {};
    const getLeafProperties = vi.fn(
      () =>
        new Promise<PropertyRow[]>((resolve) => {
          release = resolve;
        }),
    );
    const adapter = { getLeafProperties } as unknown as ViewerAdapter;
    const first = readLeafRows(adapter, ['Name', 'Level']);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = readLeafRows(adapter, ['Name']);
    release([{ dbId: 1, name: 'El', properties: { Name: 'n', Level: 'l' } }]);
    const [a, b] = await Promise.all([first, second]);
    expect(getLeafProperties).toHaveBeenCalledTimes(1);
    expect(a[0]?.properties).toEqual({ Name: 'n', Level: 'l' });
    expect(b[0]?.properties).toEqual({ Name: 'n' });
  });
});
