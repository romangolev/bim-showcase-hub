import { describe, expect, it } from 'vitest';
import { breadcrumbOf } from './breadcrumb.js';

const context = {
  crumbs: [
    'Northwind Architects',
    'Tower',
    'Architecture',
    'Models',
    'Phase 2',
  ],
  file: 'Tower.rvt',
  v: 'v3',
};

describe('breadcrumbOf', () => {
  it('ends with the file and version as the current crumb', () => {
    const crumbs = breadcrumbOf('urn-a', context, 'full');
    expect(crumbs.at(-1)).toEqual({ label: 'Tower.rvt · v3', current: true });
  });

  it('keeps the first crumb and the last two folders around an ellipsis', () => {
    const labels = breadcrumbOf('urn-a', context, 'full').map((c) => c.label);
    expect(labels).toEqual([
      'Northwind Architects',
      '…',
      'Models',
      'Phase 2',
      'Tower.rvt · v3',
    ]);
  });

  it('shows a short path whole', () => {
    const labels = breadcrumbOf(
      'urn-a',
      { crumbs: ['Hub', 'Project'], file: 'A.rvt' },
      'full',
    ).map((c) => c.label);
    expect(labels).toEqual(['Hub', 'Project', 'A.rvt']);
  });

  it('shows only the file in file mode and nothing when off', () => {
    expect(breadcrumbOf('urn-a', context, 'file')).toHaveLength(1);
    expect(breadcrumbOf('urn-a', context, 'off')).toEqual([]);
  });

  it('names a combined tab by its model count', () => {
    const crumbs = breadcrumbOf(
      'urn-a',
      { ...context, with: 'urn-b,urn-c' },
      'file',
    );
    expect(crumbs[0]?.label).toBe('3 models');
  });
});
