import type { GuiViewer3D } from '../../src/web/viewer/autodesk.js';
import {
  applyCamera,
  captureViewerState,
  HIDE_ALL_NODE,
  readCamera,
  resetNodes,
  restoreViewerState,
  VIEWER_STATE_FILTER,
} from '../../src/web/viewer/viewerState.js';

declare global {
  interface Window {
    viewer?: GuiViewer3D;
    __bshViewerReady?: boolean;
    __bshViewerState?: Record<string, (...args: never[]) => unknown>;
  }
}

const MODEL_ID = 'revit';

function context() {
  const viewer = window.viewer;
  const handle = viewer?.model;
  if (!viewer || !handle) throw new Error('The viewer is not ready');
  return { viewer, models: [{ id: MODEL_ID, handle }] };
}

function selection(viewer: GuiViewer3D) {
  return viewer.getSelection().map((dbId) => ({ modelId: MODEL_ID, dbId }));
}

window.__bshViewerState = {
  hideNodeId: () => HIDE_ALL_NODE,
  filter: () => VIEWER_STATE_FILTER,
  rawState: () => context().viewer.getState?.(VIEWER_STATE_FILTER),
  cutplanes: () =>
    context()
      .viewer.getCutPlanes?.()
      .map(({ x, y, z, w }) => [x, y, z, w]),
  leaves: () =>
    new Promise<number[]>((resolve, reject) => {
      const { viewer } = context();
      viewer.model?.getObjectTree?.((tree) => {
        const ids: number[] = [];
        tree.enumNodeChildren(
          tree.getRootId(),
          (id) => {
            if (tree.getChildCount(id) === 0) ids.push(id);
          },
          true,
        );
        resolve(ids);
      }, reject);
    }),
  hide: (ids: number[]) => {
    const { viewer, models } = context();
    viewer.hide?.(ids, models[0]?.handle);
  },
  isolate: (ids: number[]) => {
    const { viewer, models } = context();
    viewer.isolate?.(ids, models[0]?.handle);
  },
  select: (ids: number[]) => {
    const { viewer, models } = context();
    viewer.select?.(ids, models[0]?.handle);
  },
  showAll: () => {
    const { viewer, models } = context();
    resetNodes(viewer, models);
  },
  fit: (ids?: number[]) => {
    const { viewer, models } = context();
    viewer.fitToView?.(ids ?? null, ids ? models[0]?.handle : null, true);
  },
  nodes: () => {
    const { viewer, models } = context();
    const handle = models[0]?.handle;
    return {
      isolated: viewer.getIsolatedNodes?.(handle) ?? [],
      hidden: viewer.getHiddenNodes?.(handle) ?? [],
      selection: viewer.getSelection(),
    };
  },
  frame: () => {
    const { viewer } = context();
    return {
      width: viewer.container.clientWidth,
      height: viewer.container.clientHeight,
    };
  },
  screenshot: (width: number, height: number) =>
    new Promise<{ width: number; height: number }>((resolve, reject) => {
      const { viewer } = context();
      const timer = setTimeout(() => reject(new Error('timed out')), 20000);
      viewer.getScreenShot?.(width, height, (url) => {
        clearTimeout(timer);
        fetch(url)
          .then((response) => response.blob())
          .then((blob) => createImageBitmap(blob))
          .then((bitmap) => {
            resolve({ width: bitmap.width, height: bitmap.height });
          })
          .catch(reject);
      });
    }),
  camera: () => readCamera(context().viewer),
  setCamera: (camera: Parameters<typeof applyCamera>[1]) =>
    applyCamera(context().viewer, camera),
  capture: () => {
    const { viewer, models } = context();
    return captureViewerState(viewer, models, selection(viewer));
  },
  restore: async (state: unknown) => {
    const { viewer, models } = context();
    const picked = await restoreViewerState(viewer, models, state);
    viewer.select?.(
      picked.map((item) => item.dbId),
      models[0]?.handle,
    );
    return picked;
  },
} as Window['__bshViewerState'];
