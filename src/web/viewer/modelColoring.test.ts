import { describe, expect, it, vi } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import { buildColoring } from '../extensions/colorBy.js';
import { loadedMockAdapter } from '../test/mockAdapter.js';
import { colorLayersFor } from './colorLayers.js';
import { claimGhosting, releaseGhosting } from './ghosting.js';
import { buildMockElements } from './mockModel.js';
import {
  applyColoring,
  clearColoring,
  currentColoring,
  hiddenGroups,
  subscribeColoring,
  toggleColoringGroup,
} from './modelColoring.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

function fakeAdapter() {
  return {
    setModelThemingColor: vi.fn(),
    clearModelThemingColors: vi.fn(),
    setGhosting: vi.fn(),
    getIsolated: () => [],
  } as unknown as ViewerAdapter;
}

const coloring = buildColoring(
  'property',
  'Category',
  [{ dbId: 1, name: 'a', properties: { Category: 'Walls' }, modelId: 'm' }],
  () => 'Walls',
  ['Walls'],
  ['#ff0000'],
);

describe('modelColoring', () => {
  it('writes the chart layer, keeps the coloring and notifies', () => {
    const adapter = fakeAdapter();
    const listener = vi.fn();
    subscribeColoring(adapter, listener);
    applyColoring(adapter, coloring);
    expect(colorLayersFor(adapter).hasColor('chart', 'm', 1)).toBe(true);
    expect(currentColoring(adapter)).toBe(coloring);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('clears only the chart layer', () => {
    const adapter = fakeAdapter();
    colorLayersFor(adapter).setColors(
      'paint',
      [{ modelId: 'm', dbId: 2 }],
      [0, 1, 0, 1],
    );
    applyColoring(adapter, coloring);
    clearColoring(adapter);
    expect(colorLayersFor(adapter).hasColor('chart', 'm', 1)).toBe(false);
    expect(colorLayersFor(adapter).hasColor('paint', 'm', 2)).toBe(true);
    expect(currentColoring(adapter)).toBeNull();
  });
});

const id = (n: number) => buildMockElements()[n - 1]?.dbId ?? -1;

async function mockSession() {
  const adapter = await loadedMockAdapter();
  const modelId = adapter.getModels()[0]?.id ?? '';
  const rows: PropertyRow[] = [1, 2, 3, 4].map((n) => ({
    dbId: id(n),
    name: `e${n}`,
    properties: { Kind: n < 3 ? 'A' : 'B' },
    modelId,
  }));
  const byKind = (title: string) =>
    buildColoring(
      'rules',
      title,
      rows,
      (row) => String(row.properties.Kind),
      ['A', 'B'],
      ['#ff0000', '#0000ff'],
    );
  const visible = async (dbId: number) =>
    (await adapter.getVisible()).some((item) => item.dbId === id(dbId));
  const ghosting = vi.spyOn(adapter, 'setGhosting');
  return { adapter, modelId, byKind, visible, ghosting };
}

describe('coloring session', () => {
  it('shows hidden groups again when a coloring with another title replaces it', async () => {
    const { adapter, byKind, visible } = await mockSession();
    applyColoring(adapter, byKind('Kind'));
    toggleColoringGroup(adapter, 'A');
    expect(await visible(1)).toBe(false);
    applyColoring(adapter, byKind('Other'));
    expect(hiddenGroups(adapter).size).toBe(0);
    expect(await visible(1)).toBe(true);
  });

  it('keeps a hidden group hidden when the same coloring is re-applied', async () => {
    const { adapter, byKind, visible } = await mockSession();
    applyColoring(adapter, byKind('Kind'));
    toggleColoringGroup(adapter, 'A');
    applyColoring(adapter, byKind('Kind'));
    expect([...hiddenGroups(adapter)]).toEqual(['A']);
    expect(await visible(1)).toBe(false);
  });

  it('shows hidden groups again when cleared', async () => {
    const { adapter, byKind, visible } = await mockSession();
    applyColoring(adapter, byKind('Kind'));
    toggleColoringGroup(adapter, 'B');
    clearColoring(adapter);
    expect(await visible(3)).toBe(true);
  });

  it('ghosts the rest and releases it when another coloring replaces it', async () => {
    const { adapter, byKind, ghosting } = await mockSession();
    applyColoring(adapter, byKind('Kind'), { ghostRest: true });
    expect(adapter.getIsolated()).toHaveLength(4);
    expect(ghosting).toHaveBeenLastCalledWith(true);
    applyColoring(adapter, byKind('Chart'));
    expect(adapter.getIsolated()).toEqual([]);
    expect(ghosting).toHaveBeenLastCalledWith(false);
  });

  it('leaves the user’s own isolation alone when clearing', async () => {
    const { adapter, modelId, byKind } = await mockSession();
    const mine = [{ modelId, dbId: id(2) }];
    adapter.isolateModelIds(mine);
    applyColoring(adapter, byKind('Kind'));
    clearColoring(adapter);
    expect(adapter.getIsolated()).toEqual(mine);
  });

  it('keeps an isolation the user changed after ghosting', async () => {
    const { adapter, modelId, byKind } = await mockSession();
    applyColoring(adapter, byKind('Kind'), { ghostRest: true });
    const mine = [{ modelId, dbId: id(3) }];
    adapter.isolateModelIds(mine);
    clearColoring(adapter);
    expect(adapter.getIsolated()).toEqual(mine);
  });
});

describe('ghosting owner', () => {
  it('stays on while any claim exists and isolates the solid sets together', async () => {
    const { adapter, modelId, ghosting } = await mockSession();
    claimGhosting(adapter, 'paint');
    claimGhosting(adapter, 'tint', [{ modelId, dbId: id(1) }]);
    claimGhosting(adapter, 'colors', [{ modelId, dbId: id(2) }]);
    expect(adapter.getIsolated()).toHaveLength(2);
    releaseGhosting(adapter, 'colors');
    expect(adapter.getIsolated()).toEqual([{ modelId, dbId: id(1) }]);
    releaseGhosting(adapter, 'tint');
    expect(adapter.getIsolated()).toEqual([]);
    expect(ghosting.mock.calls).toEqual([[true]]);
    releaseGhosting(adapter, 'paint');
    expect(ghosting.mock.calls).toEqual([[true], [false]]);
  });

  it('does not show elements the user hid', async () => {
    const { adapter, modelId, visible } = await mockSession();
    claimGhosting(adapter, 'tint', [{ modelId, dbId: id(1) }]);
    adapter.hideModelIds([{ modelId, dbId: id(4) }]);
    releaseGhosting(adapter, 'tint');
    expect(await visible(4)).toBe(false);
  });
});
