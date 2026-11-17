export function triangleVertexCount(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
): number | null {
  if (positions.length % 3 !== 0) return null;
  const vertices = positions.length / 3;
  if (vertices < 3) return null;
  if (indices.length < 3 || indices.length % 3 !== 0) return null;
  for (let i = 0; i < indices.length; i += 1) {
    const index = indices[i] ?? 0;
    if (!Number.isInteger(index) || index < 0 || index >= vertices) return null;
  }
  return vertices;
}
