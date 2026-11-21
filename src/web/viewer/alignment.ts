import type { Vec3 } from './modelSet.js';

export type OffsetMap = Readonly<Record<string, Vec3>> | null | undefined;

function copy(offsets: OffsetMap): Record<string, Vec3> {
  return offsets ? { ...offsets } : {};
}

export function nudgeOffset(
  offsets: OffsetMap,
  modelId: string,
  axis: 0 | 1 | 2,
  meters: number,
  unitMeters: number,
): Record<string, Vec3> {
  const next = copy(offsets);
  const usable = Number.isFinite(unitMeters) && unitMeters > 0;
  const step = usable ? meters / unitMeters : meters;
  const current = next[modelId] ?? ([0, 0, 0] as const);
  const moved: [number, number, number] = [current[0], current[1], current[2]];
  moved[axis] += step;
  next[modelId] = moved;
  return next;
}

export function snapToAnchor(
  offsets: OffsetMap,
  modelId: string,
  together: Readonly<Record<string, Vec3>>,
): Record<string, Vec3> {
  const next = copy(offsets);
  const target = together[modelId];
  if (target) next[modelId] = [target[0], target[1], target[2]];
  else delete next[modelId];
  return next;
}

export function resetOffset(
  offsets: OffsetMap,
  modelId: string,
): Record<string, Vec3> | null {
  const next = copy(offsets);
  delete next[modelId];
  return Object.keys(next).length > 0 ? next : null;
}
