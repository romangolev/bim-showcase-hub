import { describe, expect, it } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import {
  applyScope,
  filterByElementScope,
  sanitizeElementScope,
} from './propertyScope.js';

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

describe('applyScope', () => {
  const rows: PropertyRow[] = [
    { modelId: 'a', dbId: 1, name: 'A', properties: {} },
    { modelId: 'b', dbId: 2, name: 'B', properties: {} },
  ];

  it('returns the input rows untouched when no scope applies', () => {
    expect(applyScope(rows, {}, [])).toBe(rows);
    expect(applyScope(rows, { models: 'all', elements: 'all' }, [])).toBe(rows);
  });

  it('still narrows the model and element scope', () => {
    expect(applyScope(rows, { models: 'b' }, [])).toEqual([rows[1]]);
    expect(
      applyScope(rows, { elements: 'selected' }, [{ modelId: 'a', dbId: 1 }]),
    ).toEqual([rows[0]]);
    expect(applyScope(rows, { elements: 'selected' }, [])).toEqual([]);
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
