import { describe, expect, it } from 'vitest';
import { nudgeOffset, resetOffset, snapToAnchor } from './alignment.js';

describe('nudgeOffset', () => {
  it('nudges in model units and keeps other models', () => {
    expect(nudgeOffset({ x: [1, 0, 0] }, 'b', 2, 1, 0.3048)).toEqual({
      x: [1, 0, 0],
      b: [0, 0, 1 / 0.3048],
    });
  });

  it('adds to an existing offset and starts from no offsets', () => {
    expect(nudgeOffset({ b: [1, 2, 3] }, 'b', 0, 2, 0.5)).toEqual({
      b: [5, 2, 3],
    });
    expect(nudgeOffset(null, 'b', 1, -0.1, 1)).toEqual({
      b: [0, -0.1, 0],
    });
    expect(nudgeOffset(undefined, 'b', 2, 0.1, 1)).toEqual({
      b: [0, 0, 0.1],
    });
  });

  it('falls back to metres without a usable unit', () => {
    expect(nudgeOffset({}, 'b', 2, 10, 0)).toEqual({ b: [0, 0, 10] });
    expect(nudgeOffset({}, 'b', 2, 10, Number.NaN)).toEqual({
      b: [0, 0, 10],
    });
  });
});

describe('snapToAnchor', () => {
  it('snaps one model and keeps the others as they are', () => {
    expect(
      snapToAnchor({ a: [1, 0, 0] }, 'b', { b: [5, 0, 0], c: [9, 9, 9] }),
    ).toEqual({
      a: [1, 0, 0],
      b: [5, 0, 0],
    });
  });

  it('drops the offset of a model the anchor does not move', () => {
    expect(
      snapToAnchor({ a: [1, 0, 0], b: [2, 0, 0] }, 'a', { b: [5, 0, 0] }),
    ).toEqual({ b: [2, 0, 0] });
  });
});

describe('resetOffset', () => {
  it('removes one model and returns null when nothing is left', () => {
    expect(resetOffset({ a: [1, 0, 0], b: [2, 0, 0] }, 'b')).toEqual({
      a: [1, 0, 0],
    });
    expect(resetOffset({ b: [2, 0, 0] }, 'b')).toBeNull();
    expect(resetOffset({}, 'b')).toBeNull();
    expect(resetOffset(null, 'b')).toBeNull();
  });
});
