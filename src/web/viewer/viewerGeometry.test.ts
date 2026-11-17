import { describe, expect, it } from 'vitest';
import type {
  FragmentList,
  GuiViewer3D,
  ViewerGeometry,
  ViewerModel,
} from './autodesk.js';
import {
  NO_MESH_MESSAGE,
  readViewerGeometry,
  STILL_LOADING_MESSAGE,
} from './viewerGeometry.js';

function geometry(
  vertices: number[],
  stride = 4,
  indices = [0, 1, 2],
): ViewerGeometry {
  return {
    vb: new Float32Array(vertices),
    vbstride: stride,
    ib: new Uint16Array(indices),
    attributes: { position: { offset: 0, itemSize: 3 } },
  };
}

function fragments(
  items: {
    geometry?: ViewerGeometry | null;
    matrix?: number[];
    line?: boolean;
    point?: boolean;
    notLoaded?: boolean;
    color?: { r: number; g: number; b: number };
  }[],
): FragmentList {
  return {
    getCount: () => items.length,
    getDbIds: (fragId) => fragId + 10,
    getVizmesh: (fragId) => {
      const item = items[fragId];
      if (!item) return {};
      return {
        geometry: item.geometry,
        matrixWorld: {
          elements: item.matrix ?? [
            1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
          ],
        },
        material: item.color ? { color: item.color } : undefined,
      };
    },
    isLine: (fragId) => Boolean(items[fragId]?.line),
    isPoint: (fragId) => Boolean(items[fragId]?.point),
    isNotLoaded: (fragId) => Boolean(items[fragId]?.notLoaded),
  };
}

function viewerOf(model: ViewerModel): GuiViewer3D {
  return {
    getAllModels: () => [model],
  } as unknown as GuiViewer3D;
}

function modelOf(
  list: FragmentList,
  unitScale = 1,
  loaded = true,
): ViewerModel {
  return {
    getFragmentList: () => list,
    getUnitScale: () => unitScale,
    isLoadDone: () => loaded,
  } as unknown as ViewerModel;
}

describe('readViewerGeometry', () => {
  it('reads interleaved positions, applies the world matrix, unit scale and colour', () => {
    const list = fragments([
      {
        geometry: geometry([1, 2, 3, 1, 4, 5, 6, 1, 7, 8, 9, 1]),
        matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1],
        color: { r: 0.1, g: 0.2, b: 0.3 },
      },
    ]);
    const model = modelOf(list, 0.5);
    const { parts } = readViewerGeometry(
      viewerOf(model),
      new Map([[model, 'Tower']]),
    );
    expect(parts).toHaveLength(1);
    expect([...(parts[0]?.positions ?? [])]).toEqual([
      5.5, 11, 16.5, 7, 12.5, 18, 8.5, 14, 19.5,
    ]);
    expect(parts[0]?.model).toBe('Tower');
    expect(parts[0]?.color).toEqual([0.1, 0.2, 0.3, 1]);
    expect(parts[0]?.name).toBe('Tower 10');
  });

  it('skips lines and points, and counts unloaded and empty fragments', () => {
    const list = fragments([
      { geometry: geometry([0, 0, 0, 1, 0, 0, 0, 1, 0]) },
      { geometry: geometry([0, 0, 0, 1, 0, 0, 0, 1, 0]), line: true },
      { geometry: geometry([0, 0, 0, 1, 0, 0, 0, 1, 0]), point: true },
      { geometry: geometry([0, 0, 0, 1, 0, 0, 0, 1, 0]), notLoaded: true },
      { geometry: null },
      { geometry: geometry([0, 0, 0, 1, 0, 0, 0, 1, 0]) },
    ]);
    const { parts, skipped } = readViewerGeometry(viewerOf(modelOf(list)));
    expect(parts.map((part) => part.dbId)).toEqual([10, 15]);
    expect(parts[0]?.name).toBe('10');
    expect(skipped).toBe(2);
  });

  it('honours the position offset in an interleaved buffer', () => {
    const list = fragments([
      {
        geometry: {
          vb: new Float32Array([99, 1, 2, 3, 99, 4, 5, 6, 99, 7, 8, 9]),
          vbstride: 4,
          ib: new Uint16Array([0, 1, 2]),
          attributes: { position: { itemOffset: 1 } },
        },
      },
    ]);
    const { parts } = readViewerGeometry(viewerOf(modelOf(list)));
    expect([...(parts[0]?.positions ?? [])]).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it('applies draw-call offsets to the indices', () => {
    const list = fragments([
      {
        geometry: {
          ...geometry([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 2, 0, 0, 2, 1, 0]),
          vbstride: 3,
          ib: new Uint16Array([0, 1, 2, 0, 1, 2]),
          offsets: [
            { start: 0, count: 3, index: 0 },
            { start: 3, count: 3, index: 3 },
          ],
        },
      },
    ]);
    const { parts } = readViewerGeometry(viewerOf(modelOf(list)));
    expect([...(parts[0]?.indices ?? [])]).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('counts fragments without a world matrix instead of placing them at the origin', () => {
    const list = fragments([
      { geometry: geometry([0, 0, 0, 1, 0, 0, 0, 1, 0]) },
    ]);
    const bare = {
      ...list,
      getVizmesh: () => ({ geometry: geometry([0, 0, 0, 1, 0, 0, 0, 1, 0]) }),
    };
    expect(readViewerGeometry(viewerOf(modelOf(list))).skipped).toBe(0);
    expect(() => readViewerGeometry(viewerOf(modelOf(bare)))).toThrow(
      NO_MESH_MESSAGE,
    );
  });

  it('does not use the fragment id as a dbId when the fragment has many', () => {
    const list = {
      ...fragments([{ geometry: geometry([0, 0, 0, 1, 0, 0, 0, 1, 0]) }]),
      getDbIds: () => [4, 5],
    };
    const { parts } = readViewerGeometry(viewerOf(modelOf(list)));
    expect(parts[0]?.dbId).toBeUndefined();
    expect(parts[0]?.name).toBe('fragment 0');
  });

  it('refuses to export while a model is still loading', () => {
    const list = fragments([
      { geometry: geometry([0, 0, 0, 1, 0, 0, 0, 1, 0]) },
    ]);
    expect(() => readViewerGeometry(viewerOf(modelOf(list, 1, false)))).toThrow(
      STILL_LOADING_MESSAGE,
    );
  });

  it('reads only the models it is given names for', () => {
    const list = fragments([
      { geometry: geometry([0, 0, 0, 1, 0, 0, 0, 1, 0]) },
    ]);
    const shown = modelOf(list);
    const hidden = modelOf(list);
    const viewer = {
      getAllModels: () => [shown, hidden],
    } as unknown as GuiViewer3D;
    const { parts } = readViewerGeometry(viewer, new Map([[shown, 'A']]));
    expect(parts).toHaveLength(1);
  });

  it('skips 2D models and throws when nothing is left', () => {
    const list = fragments([
      { geometry: geometry([0, 0, 0, 1, 0, 0, 0, 1, 0]) },
    ]);
    const model = modelOf(list);
    (model as { is2d?: () => boolean }).is2d = () => true;
    expect(() => readViewerGeometry(viewerOf(model))).toThrow(NO_MESH_MESSAGE);
  });
});
