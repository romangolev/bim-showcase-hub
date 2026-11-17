import type { GeometryPart } from '../viewer/geometryTypes.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { saveBlob } from './excelExport.js';

export interface GlbBuildOptions {
  generator?: string;
}

export interface GlbBuild {
  data: ArrayBuffer;
  triangleCount: number;
  vertexCount: number;
  meshCount: number;
  skippedParts: number;
}

export const GLB_MAGIC = 0x46546c67;
export const GLB_VERSION = 2;
export const GLB_JSON_CHUNK = 0x4e4f534a;
export const GLB_BIN_CHUNK = 0x004e4942;
export const DEFAULT_GLB_FILE_NAME = 'model-geometry.glb';
export const DEFAULT_GEOMETRY_COLOR: readonly [number, number, number, number] =
  [0.72, 0.72, 0.72, 1];

export type GlbExportStatus =
  | { phase: 'reading' }
  | { phase: 'building' }
  | {
      phase: 'done';
      fileName: string;
      triangleCount: number;
      meshCount: number;
      byteLength: number;
      missing?: string[];
      skipped?: number;
    }
  | { phase: 'empty' }
  | { phase: 'error'; message: string };

export interface GlbExportOptions {
  fileName?: string;
  onStatus?: (status: GlbExportStatus) => void;
  save?: (blob: Blob, fileName: string) => void;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function colourOf(
  part: GeometryPart,
): readonly [number, number, number, number] {
  const color = part.color ?? DEFAULT_GEOMETRY_COLOR;
  return [
    clamp01(color[0]),
    clamp01(color[1]),
    clamp01(color[2]),
    clamp01(color[3]),
  ];
}

function colourKey(color: readonly number[]): string {
  return color.map((value) => Math.round(value * 1000)).join(',');
}

function align4(value: number): number {
  return (value + 3) & ~3;
}

interface Item {
  part: GeometryPart;
  vertices: number;
  wide: boolean;
}

interface Element {
  name: string;
  dbId?: number;
  model?: string;
  items: Item[];
}

function usable(part: GeometryPart): Item | null {
  const vertices = part.positions.length / 3;
  const { indices } = part;
  if (!Number.isInteger(vertices) || vertices === 0) return null;
  if (indices.length < 3 || indices.length % 3 !== 0) return null;
  let max = 0;
  for (const index of indices) if (index > max) max = index;
  if (max >= vertices) return null;
  return { part, vertices, wide: max >= 65536 };
}

function groupByElement(parts: readonly GeometryPart[]): {
  elements: Element[];
  skipped: number;
} {
  const elements = new Map<string, Element>();
  let skipped = 0;
  for (const part of parts) {
    const item = usable(part);
    if (!item) {
      skipped += 1;
      continue;
    }
    const key =
      part.dbId === undefined
        ? `#${elements.size}`
        : `${part.model ?? ''}\u0000${part.dbId}`;
    let element = elements.get(key);
    if (!element) {
      element = {
        name: part.name,
        ...(part.dbId === undefined ? {} : { dbId: part.dbId }),
        ...(part.model === undefined ? {} : { model: part.model }),
        items: [],
      };
      elements.set(key, element);
    }
    element.items.push(item);
  }
  return { elements: [...elements.values()], skipped };
}

function indexBytes(item: Item): number {
  return align4(item.part.indices.length * (item.wide ? 4 : 2));
}

export function buildGlb(
  parts: readonly GeometryPart[],
  options: GlbBuildOptions = {},
): GlbBuild {
  const { elements, skipped } = groupByElement(parts);
  let total = 0;
  for (const element of elements) {
    for (const item of element.items) {
      total += item.vertices * 12 + indexBytes(item);
    }
  }
  const bin = new ArrayBuffer(total);
  const bufferViews: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];
  const materials: Record<string, unknown>[] = [];
  const materialByColor = new Map<string, number>();
  const meshes: Record<string, unknown>[] = [];
  const nodes: Record<string, unknown>[] = [];
  let offset = 0;
  let triangleCount = 0;
  let vertexCount = 0;

  const materialOf = (part: GeometryPart): number => {
    const color = colourOf(part);
    const key = colourKey(color);
    let index = materialByColor.get(key);
    if (index === undefined) {
      index =
        materials.push({
          name: `Material ${materials.length + 1}`,
          pbrMetallicRoughness: {
            baseColorFactor: [...color],
            metallicFactor: 0,
            roughnessFactor: 0.9,
          },
          alphaMode: color[3] < 1 ? 'BLEND' : 'OPAQUE',
          doubleSided: true,
        }) - 1;
      materialByColor.set(key, index);
    }
    return index;
  };

  for (const element of elements) {
    const primitives: Record<string, unknown>[] = [];
    for (const item of element.items) {
      const { part, vertices, wide } = item;
      const positions = new Float32Array(bin, offset, vertices * 3);
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < vertices; i += 1) {
        const x = part.positions[i * 3] as number;
        const y = part.positions[i * 3 + 1] as number;
        const z = part.positions[i * 3 + 2] as number;
        const out = [x === 0 ? 0 : x, z === 0 ? 0 : z, y === 0 ? 0 : -y];
        for (let axis = 0; axis < 3; axis += 1) {
          const value = out[axis] as number;
          positions[i * 3 + axis] = value;
          if (value < (min[axis] as number)) min[axis] = value;
          if (value > (max[axis] as number)) max[axis] = value;
        }
      }
      const positionView =
        bufferViews.push({
          buffer: 0,
          byteOffset: offset,
          byteLength: vertices * 12,
          target: 34962,
        }) - 1;
      offset += vertices * 12;

      const IndexArray = wide ? Uint32Array : Uint16Array;
      new IndexArray(bin, offset, part.indices.length).set(part.indices);
      const indexView =
        bufferViews.push({
          buffer: 0,
          byteOffset: offset,
          byteLength: part.indices.length * IndexArray.BYTES_PER_ELEMENT,
          target: 34963,
        }) - 1;
      offset += indexBytes(item);

      const positionAccessor =
        accessors.push({
          bufferView: positionView,
          componentType: 5126,
          count: vertices,
          type: 'VEC3',
          min,
          max,
        }) - 1;
      const indexAccessor =
        accessors.push({
          bufferView: indexView,
          componentType: wide ? 5125 : 5123,
          count: part.indices.length,
          type: 'SCALAR',
        }) - 1;
      primitives.push({
        attributes: { POSITION: positionAccessor },
        indices: indexAccessor,
        material: materialOf(part),
        mode: 4,
      });
      triangleCount += part.indices.length / 3;
      vertexCount += vertices;
    }
    const mesh = meshes.push({ name: element.name, primitives }) - 1;
    const extras = {
      ...(element.dbId === undefined ? {} : { dbId: element.dbId }),
      ...(element.model === undefined ? {} : { model: element.model }),
    };
    nodes.push({
      name: element.name,
      mesh,
      ...(Object.keys(extras).length ? { extras } : {}),
    });
  }

  const json = {
    asset: {
      version: '2.0',
      generator: options.generator ?? 'BIM Showcase Hub',
    },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, index) => index) }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: total ? [{ byteLength: total }] : [],
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = align4(jsonBytes.byteLength);
  const fileLength = 12 + 8 + jsonLength + (total ? 8 + total : 0);
  const out = new ArrayBuffer(fileLength);
  const view = new DataView(out);
  const bytes = new Uint8Array(out);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, fileLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, GLB_JSON_CHUNK, true);
  bytes.set(jsonBytes, 20);
  bytes.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonLength);
  if (total) {
    const binStart = 20 + jsonLength;
    view.setUint32(binStart, total, true);
    view.setUint32(binStart + 4, GLB_BIN_CHUNK, true);
    bytes.set(new Uint8Array(bin), binStart + 8);
  }
  return {
    data: out,
    triangleCount,
    vertexCount,
    meshCount: elements.length,
    skippedParts: skipped,
  };
}

export function geometryFileName(
  file?: string,
  version?: string,
  extension = 'glb',
): string {
  const base = (file ?? '').replace(/\.[A-Za-z0-9]{1,5}$/, '');
  const parts = [base, version ?? '']
    .map((part) =>
      part
        .normalize('NFKD')
        .replace(/[^A-Za-z0-9._-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^[-.]+|[-.]+$/g, ''),
    )
    .filter(Boolean);
  if (!parts.length) return DEFAULT_GLB_FILE_NAME;
  return `${parts.join('-').slice(0, 120)}-geometry.${extension}`;
}

export function describeGlbStatus(status: GlbExportStatus): string {
  switch (status.phase) {
    case 'reading':
      return 'Reading geometry';
    case 'building':
      return 'Building GLB';
    case 'done':
      return doneText(status);
    case 'empty':
      return 'No geometry to export';
    case 'error':
      return status.message;
  }
}

export function glbHasWarning(status: GlbExportStatus): boolean {
  return (
    status.phase === 'error' ||
    (status.phase === 'done' &&
      Boolean(status.missing?.length || status.skipped))
  );
}

function doneText(status: Extract<GlbExportStatus, { phase: 'done' }>): string {
  const base = `Exported ${formatCount(status.triangleCount)} triangles in ${formatCount(status.meshCount)} meshes`;
  const notes: string[] = [];
  if (status.missing?.length)
    notes.push(`missing ${status.missing.join(', ')}`);
  if (status.skipped) {
    notes.push(`${formatCount(status.skipped)} fragments skipped`);
  }
  return notes.length ? `${base}, ${notes.join(', ')}` : base;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

function missingModels(adapter: ViewerAdapter): string[] {
  if (typeof adapter.getModels !== 'function') return [];
  return adapter
    .getModels()
    .filter((model) => model.status !== 'ready')
    .map((model) => model.name);
}

export async function exportGeometryToGlb(
  adapter: ViewerAdapter,
  options: GlbExportOptions = {},
): Promise<GlbExportStatus> {
  const {
    fileName = DEFAULT_GLB_FILE_NAME,
    onStatus,
    save = saveBlob,
  } = options;
  const emit = (status: GlbExportStatus): GlbExportStatus => {
    onStatus?.(status);
    return status;
  };
  try {
    if (typeof adapter.getGeometryParts !== 'function') {
      return emit({
        phase: 'error',
        message: 'Geometry export is not available for this model',
      });
    }
    emit({ phase: 'reading' });
    const { parts, skipped: unread } = await adapter.getGeometryParts();
    if (parts.length === 0) return emit({ phase: 'empty' });
    emit({ phase: 'building' });
    const built = buildGlb(parts);
    if (built.triangleCount === 0) return emit({ phase: 'empty' });
    const blob = new Blob([built.data], {
      type: 'model/gltf-binary',
    });
    save(blob, fileName);
    const missing = missingModels(adapter);
    const skipped = unread + built.skippedParts;
    return emit({
      phase: 'done',
      fileName,
      triangleCount: built.triangleCount,
      meshCount: built.meshCount,
      byteLength: built.data.byteLength,
      ...(missing.length ? { missing } : {}),
      ...(skipped ? { skipped } : {}),
    });
  } catch (err) {
    return emit({
      phase: 'error',
      message:
        err instanceof Error && err.message
          ? `Export failed: ${err.message}`
          : 'Export failed',
    });
  }
}
