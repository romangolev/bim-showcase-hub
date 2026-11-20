import type {
  GuiViewer3D,
  InstanceTree,
  ViewerModel,
  ViewportState,
} from './autodesk.js';
import type { ModelDbId, Vec3 } from './modelSet.js';
import type {
  CameraState,
  RestoreReport,
  ViewerState,
} from './ViewerAdapter.js';

export const VIEWER_STATE_FILTER = { viewport: true, cutplanes: true } as const;
export const HIDE_ALL_NODE = -1;
export const TREE_TIMEOUT_MS = 8000;

export interface StateModel {
  id: string;
  handle: ViewerModel;
}

function isVec3(value: unknown): value is Vec3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}

function dbIds(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((n): n is number => Number.isInteger(n))
    : [];
}

function sanitizeCamera(raw: unknown): CameraState | null {
  const camera = raw as Partial<CameraState> | null;
  if (!camera || typeof camera !== 'object') return null;
  const { eye, target, up } = camera;
  if (!isVec3(eye) || !isVec3(target) || !isVec3(up)) return null;
  const result: CameraState = {
    eye: [...eye],
    target: [...target],
    up: [...up],
    ortho: camera.ortho === true,
  };
  const height = camera.orthoHeight;
  if (typeof height === 'number' && Number.isFinite(height) && height > 0) {
    result.orthoHeight = height;
  }
  return result;
}

function sanitizeExplode(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 && raw <= 1
    ? raw
    : undefined;
}

export function sanitizeViewerState(raw: unknown): ViewerState | null {
  const state = raw as Partial<ViewerState> | null;
  if (!state || typeof state !== 'object' || state.version !== 1) return null;
  const models: ViewerState['models'] = {};
  const entries =
    state.models && typeof state.models === 'object'
      ? Object.entries(state.models)
      : [];
  for (const [id, nodes] of entries) {
    const entry = (nodes ?? {}) as Partial<ViewerState['models'][string]>;
    models[id] = {
      isolated: dbIds(entry.isolated),
      hidden: dbIds(entry.hidden),
      selection: dbIds(entry.selection),
    };
  }
  const cutplanes = Array.isArray(state.cutplanes)
    ? state.cutplanes
        .filter(
          (plane): plane is number[] =>
            Array.isArray(plane) &&
            plane.length === 4 &&
            plane.every((n) => typeof n === 'number' && Number.isFinite(n)),
        )
        .map((plane) => [...plane])
    : [];
  const explode = sanitizeExplode(state.explode);
  return {
    version: 1,
    camera: sanitizeCamera(state.camera),
    cutplanes,
    ...(explode !== undefined ? { explode } : {}),
    models,
  };
}

export function readCamera(viewer: GuiViewer3D): CameraState | null {
  const viewport = viewer.getState?.({ viewport: true }).viewport;
  if (!viewport) return null;
  return sanitizeCamera({
    eye: viewport.eye,
    target: viewport.target,
    up: viewport.up,
    ortho: viewport.isOrthographic,
    orthoHeight: viewport.orthographicHeight,
  });
}

function viewportFor(
  current: ViewportState,
  camera: CameraState,
): ViewportState {
  const viewport: ViewportState = {
    ...current,
    eye: [...camera.eye],
    target: [...camera.target],
    up: [...camera.up],
    isOrthographic: camera.ortho,
    projection: camera.ortho ? 'orthographic' : 'perspective',
  };
  if (camera.orthoHeight !== undefined) {
    viewport.orthographicHeight = camera.orthoHeight;
  }
  return viewport;
}

export function applyCamera(viewer: GuiViewer3D, camera: CameraState): void {
  const current = viewer.getState?.({ viewport: true }).viewport;
  if (!viewer.restoreState || !current) return;
  viewer.restoreState(
    { viewport: viewportFor(current, camera) },
    { viewport: true },
    true,
  );
}

function readCutplanes(viewer: GuiViewer3D): number[][] {
  if (viewer.getCutPlanes) {
    return viewer.getCutPlanes().map(({ x, y, z, w }) => [x, y, z, w]);
  }
  return (viewer.getState?.({ cutplanes: true }).cutplanes ?? []).map(
    (plane) => [...plane],
  );
}

export function captureViewerState(
  viewer: GuiViewer3D,
  models: readonly StateModel[],
  selection: readonly ModelDbId[],
): ViewerState {
  const state: ViewerState = {
    version: 1,
    camera: readCamera(viewer),
    cutplanes: readCutplanes(viewer),
    models: {},
  };
  const explode = sanitizeExplode(viewer.getExplodeScale?.());
  if (explode !== undefined) state.explode = explode;
  for (const { id, handle } of models) {
    state.models[id] = {
      isolated: [...(viewer.getIsolatedNodes?.(handle) ?? [])],
      hidden: [...(viewer.getHiddenNodes?.(handle) ?? [])],
      selection: selection
        .filter((item) => item.modelId === id)
        .map((item) => item.dbId),
    };
  }
  return state;
}

export function readTree(
  viewer: GuiViewer3D,
  model: ViewerModel,
): Promise<InstanceTree> {
  return new Promise<InstanceTree>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Object tree timed out')),
      TREE_TIMEOUT_MS,
    );
    const done =
      <T>(settle: (value: T) => void) =>
      (value: T) => {
        clearTimeout(timer);
        settle(value);
      };
    if (model.getObjectTree) {
      model.getObjectTree(done(resolve), done(reject));
    } else viewer.getObjectTree(done(resolve), done(reject));
  });
}

async function knownIds(
  viewer: GuiViewer3D,
  model: ViewerModel,
): Promise<Set<number> | null> {
  try {
    const tree = await readTree(viewer, model);
    const ids = new Set<number>([tree.getRootId()]);
    tree.enumNodeChildren(
      tree.getRootId(),
      (id) => {
        ids.add(id);
      },
      true,
    );
    return ids;
  } catch {
    return null;
  }
}

export function resetNodes(
  viewer: GuiViewer3D,
  models: readonly StateModel[],
): void {
  for (const { handle } of models) {
    viewer.isolate?.([], handle);
    const hidden = viewer.getHiddenNodes?.(handle) ?? [];
    if (hidden.length > 0) viewer.show?.(hidden, handle);
  }
}

export async function restoreViewerState(
  viewer: GuiViewer3D,
  models: readonly StateModel[],
  raw: unknown,
): Promise<{ selection: ModelDbId[]; report: RestoreReport }> {
  const report: RestoreReport = { skippedModels: [], viewerFailed: false };
  const state = sanitizeViewerState(raw);
  if (!state) return { selection: [], report };
  const known = await Promise.all(
    models.map(({ handle }) => knownIds(viewer, handle)),
  );
  const selection: ModelDbId[] = [];
  models.forEach(({ id, handle }, index) => {
    const saved = state.models[id];
    const ids = known[index];
    if (!saved) return;
    if (!ids) {
      report.skippedModels.push(id);
      return;
    }
    resetNodes(viewer, [{ id, handle }]);
    const valid = (list: readonly number[]) => list.filter((n) => ids.has(n));
    const isolated = saved.isolated.includes(HIDE_ALL_NODE)
      ? [HIDE_ALL_NODE]
      : valid(saved.isolated);
    if (isolated.length > 0) viewer.isolate?.(isolated, handle);
    const hidden = valid(saved.hidden);
    if (hidden.length > 0) viewer.hide?.(hidden, handle);
    for (const dbId of valid(saved.selection)) {
      selection.push({ modelId: id, dbId });
    }
  });
  if (viewer.restoreState && viewer.getState) {
    if (state.cutplanes.length === 0 && readCutplanes(viewer).length > 0) {
      viewer.impl?.setCutPlanes?.([]);
    }
    const next: { viewport?: ViewportState; cutplanes?: number[][] } = {};
    const current = viewer.getState(VIEWER_STATE_FILTER);
    if (state.camera && current.viewport) {
      next.viewport = viewportFor(current.viewport, state.camera);
    }
    if (state.cutplanes.length > 0) next.cutplanes = state.cutplanes;
    if (next.viewport || next.cutplanes || viewer.explode) {
      try {
        if (next.viewport || next.cutplanes) {
          viewer.restoreState(next, VIEWER_STATE_FILTER, true);
        }
        viewer.explode?.(state.explode ?? 0);
      } catch {
        report.viewerFailed = true;
      }
    }
  }
  return { selection, report };
}
