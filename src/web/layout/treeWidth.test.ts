import { describe, expect, it } from 'vitest';
import { measureTreeWidth, type TreeWidthSource } from './dockOps.js';

function source(options: {
  tree?: 'grid' | 'floating' | null;
  width?: number;
  collapsed?: boolean;
  groups?: number;
}): TreeWidthSource {
  const element = document.createElement('div');
  if (options.collapsed) element.dataset.collapsed = 'width';
  const tree =
    options.tree === null
      ? undefined
      : {
          api: { location: { type: options.tree ?? 'grid' } },
          group: { width: options.width ?? 0, element },
        };
  return {
    getPanel: (id) => (id === 'tree' ? tree : undefined),
    groups: Array.from({ length: options.groups ?? 2 }, () => ({
      api: { location: { type: 'grid' } },
    })),
  };
}

describe('measureTreeWidth', () => {
  it('reads the Documents group width when it shares the dock', () => {
    expect(measureTreeWidth(source({ width: 411.4 }))).toBe(411);
  });

  it('ignores Documents alone, floating, collapsed or missing', () => {
    expect(measureTreeWidth(source({ width: 1400, groups: 1 }))).toBeNull();
    expect(
      measureTreeWidth(source({ width: 300, tree: 'floating' })),
    ).toBeNull();
    expect(measureTreeWidth(source({ width: 33, collapsed: true }))).toBeNull();
    expect(measureTreeWidth(source({ tree: null }))).toBeNull();
  });
});
