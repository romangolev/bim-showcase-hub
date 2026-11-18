import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type FakeEnvironment,
  type FakeFederatedViewer,
  installFakeFederation,
} from './fakeFederatedViewer.js';
import { RealViewerAdapter } from './RealViewerAdapter.js';
import { resetRegion } from './region.js';
import type { ViewerState } from './ViewerAdapter.js';
import { TREE_TIMEOUT_MS, VIEWER_STATE_FILTER } from './viewerState.js';

let env: FakeEnvironment;
let host: HTMLElement;
let adapter: RealViewerAdapter;

beforeEach(async () => {
  resetRegion();
  env = installFakeFederation();
  host = document.createElement('div');
  document.body.appendChild(host);
  adapter = new RealViewerAdapter(host);
  await adapter.loadModels([{ urn: 'arch' }, { urn: 'str' }]);
});

afterEach(() => {
  adapter.destroy();
  host.remove();
  vi.restoreAllMocks();
});

function viewer(): FakeFederatedViewer {
  const current = env.viewers.at(-1);
  if (!current) throw new Error('no viewer');
  return current;
}

describe('model-aware viewer actions', () => {
  it('selects, isolates, hides and shows per model', () => {
    const arch = viewer().modelOf('arch');
    const str = viewer().modelOf('str');
    adapter.selectModelIds([
      { modelId: 'arch', dbId: 11 },
      { modelId: 'str', dbId: 12 },
    ]);
    expect(adapter.getModelSelection()).toEqual([
      { modelId: 'arch', dbId: 11 },
      { modelId: 'str', dbId: 12 },
    ]);
    adapter.isolateModelIds([{ modelId: 'arch', dbId: 11 }]);
    expect(adapter.getIsolated()).toEqual([
      { modelId: 'arch', dbId: 11 },
      { modelId: 'str', dbId: -1 },
    ]);
    adapter.hideModelIds([{ modelId: 'str', dbId: 13 }]);
    expect(viewer().getHiddenNodes(str)).toEqual([13]);
    expect(viewer().getHiddenNodes(arch)).toEqual([]);
    adapter.showAll();
    expect(adapter.getIsolated()).toEqual([]);
    expect(viewer().getHiddenNodes(str)).toEqual([]);
  });

  it('fits everything without items', () => {
    adapter.fitToView();
    expect(viewer().fitCalls.at(-1)).toEqual({
      ids: null,
      model: null,
      immediate: undefined,
    });
  });

  it('fits items of one model without touching the selection', () => {
    adapter.fitToView([
      { modelId: 'str', dbId: 12 },
      { modelId: 'str', dbId: 13 },
    ]);
    expect(viewer().fitCalls.at(-1)).toEqual({
      ids: [12, 13],
      model: viewer().modelOf('str'),
      immediate: false,
    });
    expect(adapter.getModelSelection()).toEqual([]);
  });

  it('selects items of several models and fits the selection', () => {
    adapter.fitToView([
      { modelId: 'arch', dbId: 11 },
      { modelId: 'str', dbId: 12 },
    ]);
    expect(adapter.getModelSelection()).toHaveLength(2);
    expect(viewer().fitCalls.at(-1)?.ids).toBeNull();
  });

  it('ignores items of unknown models when fitting', () => {
    const before = viewer().fitCalls.length;
    adapter.fitToView([{ modelId: 'gone', dbId: 1 }]);
    expect(viewer().fitCalls).toHaveLength(before);
  });

  it('reads and sets the camera', () => {
    const camera = {
      eye: [1, 2, 3],
      target: [0, 0, 0],
      up: [0, 1, 0],
      ortho: true,
      orthoHeight: 500,
    } as const;
    adapter.setCamera({
      eye: [...camera.eye],
      target: [...camera.target],
      up: [...camera.up],
      ortho: camera.ortho,
      orthoHeight: camera.orthoHeight,
    });
    expect(adapter.getCamera()).toEqual(camera);
  });
});

describe('getVisible', () => {
  it('gives up on a tree that never answers', async () => {
    vi.useFakeTimers();
    try {
      env.specs.set('slow', { treeHang: true });
      await adapter.addModel({ urn: 'slow' });
      const done = adapter.getVisible();
      const failed = expect(done).rejects.toThrow('timed out');
      await vi.advanceTimersByTimeAsync(TREE_TIMEOUT_MS + 1);
      await failed;
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports nothing visible for a model isolated to no items', async () => {
    adapter.isolateModelIds([{ modelId: 'arch', dbId: 11 }]);
    const visible = await adapter.getVisible();
    expect(visible.some((item) => item.modelId === 'str')).toBe(false);
    expect(visible.some((item) => item.dbId === -1)).toBe(false);
  });
});

describe('viewer state', () => {
  it('captures a serializable state keyed by model', () => {
    adapter.isolateModelIds([{ modelId: 'arch', dbId: 11 }]);
    adapter.hideModelIds([{ modelId: 'arch', dbId: 12 }]);
    adapter.selectModelIds([{ modelId: 'arch', dbId: 13 }]);
    const state = adapter.getState();
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    expect(state.version).toBe(1);
    expect(state.camera?.eye).toEqual([10, 10, 10]);
    expect(state.models.arch).toEqual({
      isolated: [11],
      hidden: [12],
      selection: [13],
    });
    expect(state.models.str).toEqual({
      isolated: [-1],
      hidden: [],
      selection: [],
    });
  });

  it('never asks Autodesk for an unfiltered state', () => {
    const spy = vi.spyOn(viewer(), 'getState');
    adapter.getState();
    expect(spy).toHaveBeenCalled();
    for (const [filter] of spy.mock.calls) {
      expect(Object.keys(filter ?? {}).length).toBeGreaterThan(0);
      for (const key of Object.keys(filter ?? {})) {
        expect(Object.keys(VIEWER_STATE_FILTER)).toContain(key);
      }
    }
  });

  it('restores camera, nodes and selection', async () => {
    adapter.isolateModelIds([{ modelId: 'arch', dbId: 11 }]);
    adapter.hideModelIds([{ modelId: 'str', dbId: 13 }]);
    adapter.selectModelIds([{ modelId: 'str', dbId: 12 }]);
    adapter.setCamera({
      eye: [5, 5, 5],
      target: [1, 1, 1],
      up: [0, 0, 1],
      ortho: false,
    });
    const saved = adapter.getState();
    adapter.showAll();
    adapter.clearSelection();
    adapter.setCamera({
      eye: [9, 9, 9],
      target: [0, 0, 0],
      up: [0, 0, 1],
      ortho: false,
    });
    await adapter.restoreState(saved);
    expect(adapter.getState()).toEqual(saved);
    expect(viewer().restored.at(-1)?.filter).toEqual(VIEWER_STATE_FILTER);
  });

  it('skips unknown models and node ids without throwing', async () => {
    const state = adapter.getState();
    state.models.gone = { isolated: [5], hidden: [6], selection: [7] };
    state.models.arch = { isolated: [999], hidden: [998], selection: [997] };
    state.models.str = { isolated: [12, 999], hidden: [], selection: [12] };
    await adapter.restoreState(state);
    const after = adapter.getState();
    expect(after.models.gone).toBeUndefined();
    expect(after.models.arch).toEqual({
      isolated: [],
      hidden: [],
      selection: [],
    });
    expect(after.models.str).toEqual({
      isolated: [12],
      hidden: [],
      selection: [12],
    });
  });

  it('degrades on garbage and on a model whose tree cannot be read', async () => {
    const state = adapter.getState();
    await expect(
      adapter.restoreState(null as unknown as ViewerState),
    ).resolves.toBeUndefined();
    await expect(
      adapter.restoreState({ version: 2 } as unknown as ViewerState),
    ).resolves.toBeUndefined();
    await adapter.restoreState({
      ...state,
      camera: { eye: ['x'] },
      cutplanes: 'no',
      models: { arch: { isolated: 'no', hidden: [1.5, 'a'], selection: null } },
    } as unknown as ViewerState);
    env.specs.set('bad', { propsFail: 'no tree' });
    await adapter.addModel({ urn: 'bad' });
    state.models.bad = { isolated: [11], hidden: [], selection: [11] };
    await expect(adapter.restoreState(state)).resolves.toBeUndefined();
    expect(adapter.getState().models.bad?.isolated).toEqual([]);
  });

  it('leaves models absent from the state and models with unreadable trees untouched', async () => {
    env.specs.set('bad', { propsFail: 'no tree' });
    await adapter.addModel({ urn: 'bad' });
    adapter.isolateModelIds([{ modelId: 'str', dbId: 12 }]);
    adapter.hideModelIds([{ modelId: 'bad', dbId: 11 }]);
    const before = adapter.getState();
    await adapter.restoreState({
      version: 1,
      camera: null,
      cutplanes: [],
      models: {
        arch: { isolated: [11], hidden: [], selection: [] },
        bad: { isolated: [], hidden: [], selection: [] },
      },
    });
    const after = adapter.getState();
    expect(after.models.str).toEqual(before.models.str);
    expect(after.models.bad).toEqual(before.models.bad);
    expect(after.models.arch?.isolated).toEqual([11]);
  });

  it('gives up on a tree that never answers and degrades', async () => {
    vi.useFakeTimers();
    try {
      env.specs.set('slow', { treeHang: true });
      await adapter.addModel({ urn: 'slow' });
      const state = adapter.getState();
      state.models.slow = { isolated: [11], hidden: [], selection: [] };
      state.models.arch = { isolated: [11], hidden: [], selection: [] };
      const done = adapter.restoreState(state);
      await vi.advanceTimersByTimeAsync(TREE_TIMEOUT_MS + 1);
      await expect(done).resolves.toBeUndefined();
      expect(adapter.getState().models.arch?.isolated).toEqual([11]);
      expect(adapter.getState().models.slow?.isolated).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('captures and clears cutplanes', async () => {
    viewer().cutplanes = [[0, 0, 1, -5]];
    const state = adapter.getState();
    expect(state.cutplanes).toEqual([[0, 0, 1, -5]]);
    viewer().cutplanes = [];
    await adapter.restoreState(state);
    expect(viewer().cutplanes).toEqual([[0, 0, 1, -5]]);
    await adapter.restoreState({ ...state, cutplanes: [] });
    expect(viewer().cutplanes).toEqual([]);
  });

  it('restores nothing after the adapter is destroyed', async () => {
    const state = adapter.getState();
    adapter.destroy();
    await expect(adapter.restoreState(state)).resolves.toBeUndefined();
    expect(adapter.getState().models).toEqual({});
  });
});
