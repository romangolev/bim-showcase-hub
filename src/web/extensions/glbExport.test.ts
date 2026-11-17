import { describe, expect, it, vi } from 'vitest';
import type { GeometryPart, GeometryRead } from '../viewer/geometryTypes.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import {
  buildGlb,
  DEFAULT_GLB_FILE_NAME,
  describeGlbStatus,
  exportGeometryToGlb,
  GLB_BIN_CHUNK,
  GLB_JSON_CHUNK,
  GLB_MAGIC,
  GLB_VERSION,
  geometryFileName,
} from './glbExport.js';

function triangle(overrides: Partial<GeometryPart> = {}): GeometryPart {
  return {
    name: '1',
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint16Array([0, 1, 2]),
    color: [1, 0, 0, 1],
    ...overrides,
  };
}

interface Parsed {
  json: Record<string, unknown>;
  bin: Uint8Array;
}

function parseGlb(buffer: ArrayBuffer): Parsed {
  const view = new DataView(buffer);
  expect(view.getUint32(0, true)).toBe(GLB_MAGIC);
  expect(view.getUint32(4, true)).toBe(GLB_VERSION);
  expect(view.getUint32(8, true)).toBe(buffer.byteLength);
  const jsonLength = view.getUint32(12, true);
  expect(view.getUint32(16, true)).toBe(GLB_JSON_CHUNK);
  const json = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)),
  ) as Record<string, unknown>;
  const binStart = 20 + jsonLength;
  if (buffer.byteLength === binStart) return { json, bin: new Uint8Array() };
  const binLength = view.getUint32(binStart, true);
  expect(view.getUint32(binStart + 4, true)).toBe(GLB_BIN_CHUNK);
  return {
    json,
    bin: new Uint8Array(buffer, binStart + 8, binLength),
  };
}

describe('buildGlb', () => {
  it('writes a valid glTF 2.0 binary container', () => {
    const built = buildGlb([triangle()]);
    const { json } = parseGlb(built.data);
    expect(json.asset).toMatchObject({ version: '2.0' });
    expect(json.scenes).toEqual([{ nodes: [0] }]);
    const views = json.bufferViews as { buffer: number; target: number }[];
    expect(views.every((view) => view.buffer === 0)).toBe(true);
    expect(views.map((view) => view.target)).toEqual([34962, 34963]);
    expect(built.triangleCount).toBe(1);
    expect(built.vertexCount).toBe(3);
    expect(built.meshCount).toBe(1);
  });

  it('converts Z-up viewer space to Y-up', () => {
    const built = buildGlb([triangle()]);
    const { json, bin } = parseGlb(built.data);
    const accessors = json.accessors as { min: number[]; max: number[] }[];
    expect(accessors[0]?.min).toEqual([0, 0, -1]);
    expect(accessors[0]?.max).toEqual([1, 0, 0]);
    const view = (json.bufferViews as { byteOffset: number }[])[0];
    const positions = new Float32Array(
      bin.buffer,
      bin.byteOffset + (view?.byteOffset ?? 0),
      9,
    );
    expect([...positions]).toEqual([0, 0, 0, 1, 0, 0, 0, 0, -1]);
  });

  it('writes one node per element and keeps the dbId in extras', () => {
    const built = buildGlb([
      triangle({ dbId: 7, model: 'A', name: 'A 7' }),
      triangle({ dbId: 7, model: 'A', name: 'A 7' }),
      triangle({ dbId: 8, model: 'A', name: 'A 8' }),
      triangle({ dbId: 7, model: 'B', name: 'B 7' }),
    ]);
    const { json } = parseGlb(built.data);
    const nodes = json.nodes as {
      name: string;
      mesh: number;
      extras: { dbId: number; model: string };
    }[];
    expect(nodes.map((node) => node.extras)).toEqual([
      { dbId: 7, model: 'A' },
      { dbId: 8, model: 'A' },
      { dbId: 7, model: 'B' },
    ]);
    expect(nodes.map((node) => node.name)).toEqual(['A 7', 'A 8', 'B 7']);
    const meshes = json.meshes as { primitives: unknown[] }[];
    expect(meshes.map((mesh) => mesh.primitives.length)).toEqual([2, 1, 1]);
    expect(built.meshCount).toBe(3);
    expect(built.triangleCount).toBe(4);
  });

  it('keeps parts without a dbId as separate nodes without extras', () => {
    const { json } = parseGlb(buildGlb([triangle(), triangle()]).data);
    const nodes = json.nodes as { extras?: unknown }[];
    expect(nodes).toHaveLength(2);
    expect(nodes.every((node) => node.extras === undefined)).toBe(true);
  });

  it('shares one material between parts of the same colour', () => {
    const { json } = parseGlb(
      buildGlb([
        triangle({ dbId: 1 }),
        triangle({ dbId: 2 }),
        triangle({ dbId: 3, color: [0, 1, 0, 1] }),
      ]).data,
    );
    expect(json.materials).toHaveLength(2);
  });

  it('uses 16-bit indices when the mesh is small and 32-bit when it is not', () => {
    const small = parseGlb(buildGlb([triangle()]).data).json;
    const smallAccessors = small.accessors as { componentType: number }[];
    expect(smallAccessors[1]?.componentType).toBe(5123);

    const bigPositions = new Float32Array(65538 * 3);
    const big = parseGlb(
      buildGlb([
        triangle({
          positions: bigPositions,
          indices: new Uint32Array([0, 65536, 65537]),
        }),
      ]).data,
    ).json;
    const bigAccessors = big.accessors as { componentType: number }[];
    expect(bigAccessors[1]?.componentType).toBe(5125);
  });

  it('marks translucent parts as blended and keeps opaque ones opaque', () => {
    const { json } = parseGlb(
      buildGlb([
        triangle({ color: [0, 0, 1, 0.5] }),
        triangle({ color: [0, 1, 0, 1] }),
      ]).data,
    );
    const materials = json.materials as { alphaMode: string }[];
    expect(materials.map((material) => material.alphaMode)).toEqual([
      'BLEND',
      'OPAQUE',
    ]);
  });

  it('skips parts with broken indices', () => {
    const built = buildGlb([
      triangle({ indices: new Uint16Array([0, 1, 2, 0]) }),
      triangle({ indices: new Uint16Array([0, 1, 3]) }),
      triangle({ positions: new Float32Array([0, 0, 0, 1, 0]) }),
      triangle({ dbId: 1 }),
    ]);
    expect(built.skippedParts).toBe(3);
    expect(built.triangleCount).toBe(1);
  });

  it('skips parts with non-finite positions', () => {
    const built = buildGlb([
      triangle({
        positions: new Float32Array([0, 0, 0, 1, Number.NaN, 0, 0, 1, 0]),
      }),
      triangle(),
    ]);
    expect(built.skippedParts).toBe(1);
    expect(built.triangleCount).toBe(1);
  });

  it('returns an empty scene for parts without triangles', () => {
    const built = buildGlb([
      triangle({ indices: new Uint16Array() }),
      triangle({ positions: new Float32Array() }),
    ]);
    const { json } = parseGlb(built.data);
    expect(built.triangleCount).toBe(0);
    expect(built.skippedParts).toBe(2);
    expect(json.meshes).toEqual([]);
  });
});

describe('geometryFileName', () => {
  it('sanitizes the model name and version', () => {
    expect(geometryFileName('Snowdon Towers Sample.rvt', 'v3')).toBe(
      'Snowdon-Towers-Sample-v3-geometry.glb',
    );
    expect(geometryFileName('Café plan.nwd')).toBe('Cafe-plan-geometry.glb');
  });

  it('falls back without a file name', () => {
    expect(geometryFileName()).toBe(DEFAULT_GLB_FILE_NAME);
    expect(geometryFileName('***.rvt')).toBe(DEFAULT_GLB_FILE_NAME);
  });
});

describe('exportGeometryToGlb', () => {
  function adapterWith(
    parts: GeometryPart[],
    skipped = 0,
  ): ViewerAdapter & { getGeometryParts: () => Promise<GeometryRead> } {
    return {
      getGeometryParts: async () => ({ parts, skipped }),
      getModels: () => [
        {
          id: 'a',
          urn: 'a',
          name: 'Building.rvt',
          visible: true,
          status: 'ready',
        },
      ],
    } as unknown as ViewerAdapter & {
      getGeometryParts: () => Promise<GeometryRead>;
    };
  }

  it('saves a GLB and reports the triangle count', async () => {
    const save = vi.fn();
    const phases: string[] = [];
    const status = await exportGeometryToGlb(adapterWith([triangle()]), {
      fileName: 'building.glb',
      save,
      onStatus: (next) => phases.push(next.phase),
    });
    expect(status).toMatchObject({
      phase: 'done',
      fileName: 'building.glb',
      triangleCount: 1,
      meshCount: 1,
    });
    expect(phases).toEqual(['reading', 'building', 'done']);
    expect(save).toHaveBeenCalledTimes(1);
    const blob = save.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe('model/gltf-binary');
    expect(blob.size).toBeGreaterThan(100);
  });

  it('counts unread and broken fragments as skipped', async () => {
    const status = await exportGeometryToGlb(
      adapterWith(
        [triangle(), triangle({ indices: new Uint16Array([0, 1, 9]) })],
        2,
      ),
      { save: vi.fn() },
    );
    expect(status).toMatchObject({ phase: 'done', skipped: 3 });
    expect(describeGlbStatus(status)).toContain('3 fragments skipped');
  });

  it('refuses a file above the byte cap without saving', async () => {
    const save = vi.fn();
    const status = await exportGeometryToGlb(adapterWith([triangle()]), {
      save,
      maxBytes: 10,
    });
    expect(status).toMatchObject({
      phase: 'error',
      message: expect.stringContaining('larger than'),
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('reports an empty model without saving', async () => {
    const save = vi.fn();
    const status = await exportGeometryToGlb(adapterWith([]), { save });
    expect(status.phase).toBe('empty');
    expect(save).not.toHaveBeenCalled();
  });

  it('reports adapters without geometry support as an error', async () => {
    const status = await exportGeometryToGlb({} as ViewerAdapter);
    expect(status).toMatchObject({
      phase: 'error',
      message: 'Geometry export is not available for this model',
    });
  });
});
