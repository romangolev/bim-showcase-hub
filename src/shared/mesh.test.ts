import { describe, expect, it } from 'vitest';
import { triangleVertexCount } from './mesh.js';

const TRI = [0, 0, 0, 1, 0, 0, 0, 1, 0];

describe('triangleVertexCount', () => {
  it('returns the vertex count of a valid mesh', () => {
    expect(triangleVertexCount(TRI, [0, 1, 2])).toBe(3);
    expect(
      triangleVertexCount(
        new Float32Array(TRI),
        new Uint16Array([2, 1, 0, 0, 1, 2]),
      ),
    ).toBe(3);
  });

  it('rejects broken meshes', () => {
    expect(triangleVertexCount([0, 0, 0, 1], [0, 1, 2])).toBeNull();
    expect(triangleVertexCount([0, 0, 0, 1, 0, 0], [0, 1, 0])).toBeNull();
    expect(triangleVertexCount(TRI, [0, 1])).toBeNull();
    expect(triangleVertexCount(TRI, [0, 1, 2, 0])).toBeNull();
    expect(triangleVertexCount(TRI, [0, 1, 3])).toBeNull();
    expect(triangleVertexCount([], [])).toBeNull();
    for (const bad of [-1, Number.NaN, 1.5, Number.POSITIVE_INFINITY]) {
      expect(triangleVertexCount(TRI, [0, 1, bad])).toBeNull();
    }
  });
});
