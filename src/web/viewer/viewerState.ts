import type {
  GuiViewer3D,
  InstanceTree,
  ViewerModel,
  ViewportState,
} from './autodesk.js';
import type { ModelDbId, Vec3 } from './modelSet.js';
import type { CameraState, ViewerState } from './ViewerAdapter.js';

export const VIEWER_STATE_FILTER = { viewport: true, cutplanes: true } as const;
export const HIDE_ALL_NODE = -1;

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
  return {
    eye: [...eye],
    target: [...target],
    up: [...up],
    ortho: camera.ortho === true,
  };
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
  return {
    version: 1,
    camera: sanitizeCamera(state.camera),
    cutplanes,
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
  });
}

function viewportFor(
  current: ViewportState,
  camera: CameraState,
): ViewportState {
  return {
    ...current,
    eye: [...camera.eye],
    target: [...camera.target],
    up: [...camera.up],
    isOrthographic: camera.ortho,
    projection: camera.ortho ? 'orthographic' : 'perspective',
  };
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

export function captureViewerState(
  viewer: GuiViewer3D,
  models: readonly StateModel[],
  selection: readonly ModelDbId[],
): ViewerState {
  const own = viewer.getState?.(VIEWER_STATE_FILTER);
  const state: ViewerState = {
    version: 1,
    camera: readCamera(viewer),
    cutplanes: (own?.cutplanes ?? []).map((plane) => [...plane]),
    models: {},
  };
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

function readTree(
  viewer: GuiViewer3D,
  model: ViewerModel,
): Promise<InstanceTree> {
  return new Promise<InstanceTree>((resolve, reject) => {
    if (model.getObjectTree) model.getObjectTree(resolve, reject);
    else viewer.getObjectTree(resolve, reject);
  });
}

async function knownIds(
  viewer: GuiViewer3D,
  model: ViewerModel,
): Promise<Set<number> | null> {
  try {
    const tree = await readTree(viewer, model);
    const ids = new Set<number>([tree.getRootId()]);
    tree.enumNodeChildren(tree.getRootId(), (id) => ids.add(id), true);
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
): Promise<ModelDbId[]> {
  const state = sanitizeViewerState(raw);
  if (!state) return [];
  const known = await Promise.all(
    models.map(({ handle }) => knownIds(viewer, handle)),
  );
  resetNodes(viewer, models);
  const selection: ModelDbId[] = [];
  models.forEach(({ id, handle }, index) => {
    const saved = state.models[id];
    const ids = known[index];
    if (!saved || !ids) return;
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
    const current = viewer.getState(VIEWER_STATE_FILTER);
    const next: { viewport?: ViewportState; cutplanes: number[][] } = {
      cutplanes: state.cutplanes,
    };
    if (state.camera && current.viewport) {
      next.viewport = viewportFor(current.viewport, state.camera);
    }
    try {
      viewer.restoreState(next, VIEWER_STATE_FILTER, true);
    } catch {
      return selection;
    }
  }
  return selection;
}
