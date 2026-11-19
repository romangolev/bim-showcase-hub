import { describe, expect, it } from 'vitest';
import { filterByElementScope, sanitizeElementScope } from './propertyScope.js';

describe('filterByElementScope', () => {
  const rows = [
    { modelId: 'a', dbId: 1 },
    { modelId: 'b', dbId: 1 },
    { dbId: 2 },
  ];

  it('keeps everything for all and nothing for an empty item list', () => {
    expect(filterByElementScope(rows, 'all', [])).toHaveLength(3);
    expect(filterByElementScope(rows, 'isolated', [])).toEqual([]);
  });

  it('matches model and element, falling back to the primary model', () => {
    const items = [
      { modelId: 'b', dbId: 1 },
      { modelId: 'a', dbId: 2 },
    ];
    expect(filterByElementScope(rows, 'selected', items, 'a')).toEqual([
      { modelId: 'b', dbId: 1 },
      { dbId: 2 },
    ]);
  });
});

describe('set scope', () => {
  it('sanitizes set ids and rejects other strings', () => {
    expect(sanitizeElementScope('set:ss-1_a')).toBe('set:ss-1_a');
    expect(sanitizeElementScope('set:')).toBe('all');
    expect(sanitizeElementScope('set:a b')).toBe('all');
    expect(sanitizeElementScope('sets:x')).toBe('all');
  });
});
