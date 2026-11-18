import { tick } from '../extensions/exportCommon.js';
import type {
  FragmentList,
  GuiViewer3D,
  ViewerGeometry,
  ViewerMaterial,
  ViewerModel,
} from './autodesk.js';
import type { GeometryPart, GeometryRead } from './geometryTypes.js';

export const NO_MESH_MESSAGE = 'This model has no viewable geometry';
export const STILL_LOADING_MESSAGE =
  'The model is still loading. Try again when it has finished';

function modelsOf(viewer: GuiViewer3D): ViewerModel[] {
  const all = viewer.getAllModels?.();
  if (all?.length) return all;
  return viewer.model ? [viewer.model] : [];
}

function positionOffset(geometry: ViewerGeometry): number {
  const attribute = geometry.attributes?.position;
  return attribute?.offset ?? attribute?.itemOffset ?? 0;
}

function colorOf(
  material: ViewerMaterial | undefined,
): readonly [number, number, number, number] | undefined {
  if (!material) return undefined;
  const color = material.color;
  if (
    color &&
    typeof color.r === 'number' &&
    typeof color.g === 'number' &&
    typeof color.b === 'number'
  ) {
    const alpha = typeof material.opacity === 'number' ? material.opacity : 1;
    return [color.r, color.g, color.b, alpha];
  }
  if (color?.getHexString) {
    const hex = color.getHexString();
    const value = Number.parseInt(hex, 16);
    if (Number.isFinite(value)) {
      return [
        ((value >> 16) & 255) / 255,
        ((value >> 8) & 255) / 255,
        (value & 255) / 255,
        typeof material.opacity === 'number' ? material.opacity : 1,
      ];
    }
  }
  return undefined;
}

function transformPositions(
  geometry: ViewerGeometry,
  matrix: ArrayLike<number>,
  scale: number,
): Float32Array | null {
  const { vb, vbstride } = geometry;
  if (!vb || !vbstride || vb.length < vbstride) return null;
  const offset = positionOffset(geometry);
  const count = Math.floor(vb.length / vbstride);
  const positions = new Float32Array(count * 3);
  const m = matrix;
  for (let index = 0; index < count; index += 1) {
    const base = index * vbstride + offset;
    const x = vb[base] as number;
    const y = vb[base + 1] as number;
    const z = vb[base + 2] as number;
    const out = index * 3;
    positions[out] =
      ((m[0] as number) * x +
        (m[4] as number) * y +
        (m[8] as number) * z +
        (m[12] as number)) *
      scale;
    positions[out + 1] =
      ((m[1] as number) * x +
        (m[5] as number) * y +
        (m[9] as number) * z +
        (m[13] as number)) *
      scale;
    positions[out + 2] =
      ((m[2] as number) * x +
        (m[6] as number) * y +
        (m[10] as number) * z +
        (m[14] as number)) *
      scale;
  }
  return positions;
}

function dbIdOf(fragments: FragmentList, fragId: number): number | undefined {
  const ids = fragments.getDbIds?.(fragId);
  return typeof ids === 'number' ? ids : undefined;
}

function indicesOf(geometry: ViewerGeometry): Uint16Array | Uint32Array | null {
  const { ib, offsets } = geometry;
  if (!ib) return null;
  if (!offsets?.length) return ib;
  const ranges = offsets.map(({ start, count, index }) => ({
    start,
    index,
    count: Math.max(0, Math.min(count, ib.length - start)),
  }));
  const out = new Uint32Array(ranges.reduce((sum, r) => sum + r.count, 0));
  let at = 0;
  for (const { start, count, index } of ranges) {
    for (let i = 0; i < count; i += 1) {
      out[at] = (ib[start + i] as number) + index;
      at += 1;
    }
  }
  return out;
}

const YIELD_EVERY = 300;

export async function readViewerGeometry(
  viewer: GuiViewer3D,
  names?: ReadonlyMap<ViewerModel, string>,
): Promise<GeometryRead> {
  const parts: GeometryPart[] = [];
  let skipped = 0;
  for (const model of modelsOf(viewer)) {
    if (names && !names.has(model)) continue;
    if (model.is2d?.()) continue;
    const fragments = model.getFragmentList?.();
    if (!fragments) continue;
    if (model.isLoadDone?.() === false) throw new Error(STILL_LOADING_MESSAGE);
    const modelName = names?.get(model);
    const rawScale = model.getUnitScale?.();
    const unitScale =
      typeof rawScale === 'number' && rawScale > 0 ? rawScale : 1;
    const count = fragments.getCount();
    for (let fragId = 0; fragId < count; fragId += 1) {
      if (fragId > 0 && fragId % YIELD_EVERY === 0) await tick();
      if (fragments.isLine?.(fragId) || fragments.isPoint?.(fragId)) continue;
      if (fragments.isNotLoaded?.(fragId)) {
        skipped += 1;
        continue;
      }
      const mesh = fragments.getVizmesh?.(fragId);
      const geometry =
        mesh?.geometry ?? fragments.getGeometry?.(fragId) ?? null;
      const matrix = mesh?.matrixWorld?.elements;
      const indices = geometry ? indicesOf(geometry) : null;
      const positions =
        geometry && matrix && matrix.length >= 16
          ? transformPositions(geometry, matrix, unitScale)
          : null;
      if (!indices || indices.length < 3 || !positions) {
        skipped += 1;
        continue;
      }
      const dbId = dbIdOf(fragments, fragId);
      parts.push({
        name: `${modelName ? `${modelName} ` : ''}${dbId ?? `fragment ${fragId}`}`,
        ...(dbId === undefined ? {} : { dbId }),
        ...(modelName ? { model: modelName } : {}),
        positions,
        indices,
        color: colorOf(mesh?.material),
      });
    }
  }
  if (parts.length === 0) throw new Error(NO_MESH_MESSAGE);
  return { parts, skipped };
}
