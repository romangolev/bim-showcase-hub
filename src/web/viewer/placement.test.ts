import { describe, expect, it } from 'vitest';
import { type ModelBox, ModelSet, type Vec3 } from './modelSet.js';
import { Placement } from './placement.js';

function setup(anchor?: string) {
  const models = new ModelSet<string>();
  const boxes = new Map<string, ModelBox>();
  const applied: [string, Vec3 | undefined][] = [];
  const centers: Record<string, number> = { a: 0, b: 100, c: 200 };
  for (const id of ['a', 'b', 'c']) {
    models.add({ urn: id });
    models.resolve(id, `h-${id}`);
    const x = centers[id] ?? 0;
    boxes.set(id, { id, min: [x - 5, -5, -5], max: [x + 5, 5, 5] });
  }
  const placement = new Placement<string>(models, {
    boxOf: (info) => boxes.get(info.id),
    anchorId: () => anchor,
    unitMeters: () => 1,
    apply: (info, _handle, offset) => applied.push([info.id, offset]),
  });
  return { models, placement, applied };
}

describe('Placement', () => {
  it('reports the spread of ready models', () => {
    const { placement } = setup();
    expect(placement.spread()?.farApart).toBe(true);
  });

  it('has no spread for one model', () => {
    const { models, placement } = setup();
    models.remove('b');
    models.remove('c');
    expect(placement.spread()).toBeNull();
  });

  it('moves every model onto the anchor', () => {
    const { placement } = setup('b');
    expect(placement.togetherOffsets()).toEqual({
      a: [100, 0, 0],
      c: [-100, 0, 0],
    });
  });

  it('falls back to the first box when the anchor is unknown', () => {
    const { placement } = setup('zzz');
    expect(Object.keys(placement.togetherOffsets()).sort()).toEqual(['b', 'c']);
  });

  it('applies offsets to ready models and tracks together', () => {
    const { placement, applied } = setup();
    placement.set({ b: [1, 2, 3] });
    expect(placement.together).toBe(true);
    expect(placement.offsetOf('b')).toEqual([1, 2, 3]);
    expect(applied).toEqual([
      ['a', undefined],
      ['b', [1, 2, 3]],
      ['c', undefined],
    ]);
  });

  it('treats an empty map like null and restores originals', () => {
    const { placement, applied } = setup();
    placement.set({ b: [1, 2, 3] });
    applied.length = 0;
    placement.set({});
    expect(placement.together).toBe(false);
    expect(applied.every(([, offset]) => offset === undefined)).toBe(true);
  });

  it('forgets offsets on reset without applying', () => {
    const { placement, applied } = setup();
    placement.set({ b: [1, 2, 3] });
    applied.length = 0;
    placement.reset();
    expect(placement.together).toBe(false);
    expect(placement.offsetOf('b')).toBeUndefined();
    expect(applied).toEqual([]);
  });
});
