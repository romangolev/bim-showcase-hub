import { describe, expect, it, vi } from 'vitest';
import { buildColoring } from '../extensions/colorBy.js';
import { colorLayersFor } from './colorLayers.js';
import {
  applyColoring,
  clearColoring,
  currentColoring,
  subscribeColoring,
} from './modelColoring.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

function fakeAdapter() {
  return {
    setModelThemingColor: vi.fn(),
    clearModelThemingColors: vi.fn(),
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
