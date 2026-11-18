import { describe, expect, it } from 'vitest';
import { groupCatalog } from './propertyCatalog.js';

const catalog = [
  { name: 'Width', category: 'Dimensions' },
  { name: 'Level', category: 'Constraints' },
  { name: 'Height', category: 'Dimensions' },
  { name: 'Mark', category: 'Identity Data' },
];

describe('groupCatalog', () => {
  it('groups by category with sorted categories and names', () => {
    expect(groupCatalog(catalog)).toEqual([
      { category: 'Constraints', properties: [catalog[1]] },
      { category: 'Dimensions', properties: [catalog[2], catalog[0]] },
      { category: 'Identity Data', properties: [catalog[3]] },
    ]);
  });

  it('filters on name or category, ignoring case and padding', () => {
    expect(groupCatalog(catalog, ' WID ').map((g) => g.category)).toEqual([
      'Dimensions',
    ]);
    expect(groupCatalog(catalog, 'identity')[0]?.properties).toEqual([
      catalog[3],
    ]);
    expect(groupCatalog(catalog, 'zzz')).toEqual([]);
  });
});
