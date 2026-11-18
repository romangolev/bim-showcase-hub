import type { PropertyRow } from '../../shared/types.js';
import { notifyUnauthorized } from '../api/client.js';
import type { IfcSourceRead } from '../ifc/types.js';
import type { Theme } from '../theme/theme.js';
import {
  autodeskWindow,
  type BulkPropertyItem,
  type GuiViewer3D,
  getViewing,
  type InstanceTree,
  type PlacementMatrix,
  type ViewerModel,
  type ViewingDocument,
} from './autodesk.js';
import { ensureToolsExtension, TOOLS_EXTENSION_ID } from './autodeskTools.js';
import {
  anchorOf,
  documentLoadError,
  type FederationAnchor,
  federatedLoadOptions,
  OTHER_REGION_MESSAGE,
  pickGeometryNode,
} from './federation.js';
import { fullscreenElementOf, watchFullscreen } from './fullscreen.js';
import type { GeometryRead } from './geometryTypes.js';
import {
  CANCELLED_MESSAGE,
  checkCapacity,
  loadFailure,
  type ModelBox,
  type ModelDbId,
  type ModelInfo,
  ModelLoadError,
  type ModelMeta,
  ModelSet,
  ModelSetError,
  type ModelSource,
  type ModelSpread,
  metersPerUnit,
  modelIdFor,
  reasonOf,
  uniqueSources,
  type Vec3,
  VIEWER_CLOSED_MESSAGE,
} from './modelSet.js';
import { Placement } from './placement.js';
import { PropertyReader } from './propertyReader.js';
import {
  DISCOVERY_SAMPLE,
  mergeInfos,
  type PropertyInfo,
  type ReadOptions,
  readInChunks,
  sampleIds,
  throwIfAborted,
  UNCATEGORIZED,
} from './propertyReads.js';
import {
  apiForRegion,
  claimRegion,
  detectRegion,
  RegionConflictError,
  type ViewerRegion,
} from './region.js';
import { createResizeScheduler } from './resizeScheduler.js';
import { readSceneBackground } from './sceneBackground.js';
import { SelectionHub } from './selectionHub.js';
import { ToolGroupController } from './toolGroupController.js';
import type {
  CameraState,
  LoadStage,
  Rgba,
  ToolGroupSpec,
  ViewerAdapter,
  ViewerState,
} from './ViewerAdapter.js';
import { readViewerGeometry } from './viewerGeometry.js';
import { readViewerSource, type SourceModelMeta } from './viewerSource.js';
import {
  applyCamera,
  captureViewerState,
  HIDE_ALL_NODE,
  readCamera,
  resetNodes,
  restoreViewerState,
} from './viewerState.js';

const VIEWER_VERSION = '7.*';
const VIEWER_BASE = `https://developer.api.autodesk.com/modelderivative/v2/viewers/${VIEWER_VERSION}`;

export const SCREEN_MODE_SETTLE_MS = 400;
const FILL_BROWSER_CLASS = 'viewer-fill-browser';

type TaggedContainer = HTMLElement & { bshViewer?: GuiViewer3D };

const VIEWER_THEMES: Record<Theme, string> = {
  dark: 'dark-theme',
  light: 'light-theme',
};

let assetsPromise: Promise<void> | null = null;
let initialization: {
  viewing: unknown;
  promise: Promise<void>;
} | null = null;

function injectStyle(href: string): void {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error('Could not load the Autodesk Viewer script'));
    };
    document.head.appendChild(script);
  });
}

export function loadViewerAssets(): Promise<void> {
  if (autodeskWindow().Autodesk?.Viewing) return Promise.resolve();
  if (!assetsPromise) {
    injectStyle(`${VIEWER_BASE}/style.min.css`);
    assetsPromise = injectScript(`${VIEWER_BASE}/viewer3D.min.js`).catch(
      (err: unknown) => {
        assetsPromise = null;
        throw err;
      },
    );
  }
  return assetsPromise;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

async function fetchToken(): Promise<TokenResponse> {
  const res = await fetch('/api/viewer/token');
  if (res.status === 401) notifyUnauthorized();
  if (!res.ok) throw new Error(`Token request failed (${res.status})`);
  return (await res.json()) as TokenResponse;
}

function initializeViewing(region: ViewerRegion): Promise<void> {
  const viewing = getViewing();
  if (!claimRegion(region)) {
    return Promise.reject(new RegionConflictError(region));
  }
  if (initialization && initialization.viewing === viewing) {
    return initialization.promise;
  }
  const api = apiForRegion(region);
  const promise = new Promise<void>((resolve) => {
    viewing.Initializer(
      {
        env: 'AutodeskProduction',
        api,
        getAccessToken: (callback) => {
          fetchToken().then(
            (t) => callback(t.access_token, t.expires_in),
            () => callback('', 0),
          );
        },
      },
      resolve,
    );
  });
  initialization = { viewing, promise };
  return promise;
}

function loadDocument(urn: string) {
  return new Promise<ViewingDocument>((resolve, reject) => {
    getViewing().Document.load(`urn:${urn}`, resolve, (code, message) =>
      reject(documentLoadError(code, message)),
    );
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'The model could not be loaded';
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

function leafIds(tree: InstanceTree): number[] {
  const leaves: number[] = [];
  tree.enumNodeChildren(
    tree.getRootId(),
    (dbId) => {
      if (tree.getChildCount(dbId) === 0) leaves.push(dbId);
    },
    true,
  );
  return leaves;
}

function withDescendants(
  tree: InstanceTree,
  ids: readonly number[],
): Set<number> {
  const all = new Set(ids);
  for (const id of ids) {
    tree.enumNodeChildren(id, (child) => all.add(child), true);
  }
  return all;
}

function toPropertyValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return value;
  return String(value);
}

function groupByModel(items: readonly ModelDbId[]): Map<string, number[]> {
  const byModel = new Map<string, number[]>();
  for (const { modelId, dbId } of items) {
    const ids = byModel.get(modelId);
    if (ids) ids.push(dbId);
    else byModel.set(modelId, [dbId]);
  }
  return byModel;
}

const SCREENSHOT_TIMEOUT_MS = 10_000;

export class RealViewerAdapter implements ViewerAdapter {
  private viewer: GuiViewer3D | null = null;
  private destroyed = false;
  private theme: Theme = 'dark';
  private readonly stageListeners = new Set<(stage: LoadStage) => void>();
  private readonly selection = new SelectionHub();
  private controller: ToolGroupController | null = null;
  private mountedController: ToolGroupController | null = null;
  private toolsChain: Promise<void> = Promise.resolve();
  private modelLoaded = false;
  private started = false;
  private stopFullscreen: (() => void) | null = null;
  private frameObserver: ResizeObserver | null = null;
  private readonly models = new ModelSet<ViewerModel>();
  private readonly placement = new Placement<ViewerModel>(this.models, {
    boxOf: (info) => this.boxes.get(info.id),
    anchorId: () => this.anchorId ?? undefined,
    unitMeters: () => metersPerUnit(this.anchor?.unit),
    apply: (_info, handle, offset) => {
      if (this.viewer) this.place(this.viewer, handle, offset);
    },
  });
  private readonly reader = new PropertyReader<ViewerModel>(this.models, {
    rows: ({ handle }, names, options) =>
      this.readModelRows(this.openViewer(), handle, names, options),
    infos: ({ handle }, options) =>
      this.readModelInfos(this.openViewer(), handle, options),
  });
  private anchor: FederationAnchor | null = null;
  private api = '';
  private selectionEvent = '';
  private settling: Promise<void> = Promise.resolve();
  private starting: Promise<GuiViewer3D | null> | null = null;
  private epoch = 0;
  private anchoring: Promise<void> | null = null;
  private anchorId: string | null = null;
  private readonly boxes = new Map<string, ModelBox>();
  private readonly placements = new Map<ViewerModel, PlacementMatrix>();
  private readonly onSelection = () => {
    this.emitSelection();
  };
  private readonly resizer = createResizeScheduler(() => this.resize());
  private readonly onScreenChange = () => {
    this.resizer.schedule(SCREEN_MODE_SETTLE_MS);
  };
  private readonly onFullscreenChange = () => {
    this.resize();
    this.onScreenChange();
  };
  private readonly onFullscreenError = () => {
    const frame = this.viewer?.container;
    if (frame && fullscreenElementOf(this.document()) !== frame) {
      frame.classList.remove(FILL_BROWSER_CLASS);
    }
    this.onFullscreenChange();
  };

  constructor(private readonly container: HTMLElement) {}

  onLoadStage(cb: (stage: LoadStage) => void): () => void {
    this.stageListeners.add(cb);
    return () => {
      this.stageListeners.delete(cb);
    };
  }

  private emitStage(stage: LoadStage): void {
    for (const cb of [...this.stageListeners]) cb(stage);
  }

  async load(urn: string, name?: string, meta?: ModelMeta): Promise<void> {
    await this.loadModels([{ urn, ...(name ? { name } : {}), ...meta }]);
  }

  async loadModels(sources: readonly ModelSource[]): Promise<ModelInfo[]> {
    const unique = uniqueSources(sources);
    checkCapacity(0, unique.length);
    if (this.destroyed) return [];
    this.unload();
    const region = detectRegion(unique[0]?.urn ?? '');
    const entries = unique.map((source) => {
      const info = this.models.add(source);
      return { id: info.id, token: this.models.token(info.id) };
    });
    let viewer: GuiViewer3D | null;
    this.emitStage('starting');
    try {
      viewer = await this.ensureViewer(region);
    } catch (err) {
      if (!this.destroyed) {
        for (const { id, token } of entries) {
          this.models.fail(id, errorMessage(err), token, reasonOf(err));
        }
      }
      throw err;
    }
    if (!viewer) return [];
    const settling = this.loadSet(viewer, unique);
    this.settling = settling.catch(() => {});
    await settling;
    if (this.destroyed || this.viewer !== viewer) return [];
    const models = this.models.list();
    if (!models.some((model) => model.status === 'ready')) {
      throw loadFailure(models);
    }
    return models;
  }

  async addModel(source: ModelSource): Promise<ModelInfo> {
    if (this.destroyed) {
      throw new ModelSetError('closed', VIEWER_CLOSED_MESSAGE);
    }
    const info = this.models.add(source);
    const token = this.models.token(info.id);
    const current = () => this.models.get(info.id) ?? info;
    let viewer: GuiViewer3D | null;
    try {
      viewer = await this.ensureViewer(detectRegion(source.urn));
    } catch (err) {
      if (this.destroyed) {
        throw new ModelSetError('closed', VIEWER_CLOSED_MESSAGE);
      }
      this.models.fail(info.id, errorMessage(err), token, reasonOf(err));
      return current();
    }
    if (this.destroyed) {
      throw new ModelSetError('closed', VIEWER_CLOSED_MESSAGE);
    }
    const cancelled = () => new ModelSetError('cancelled', CANCELLED_MESSAGE);
    if (!viewer) throw cancelled();
    const doc = this.fetchDocument(source.urn);
    await this.settling;
    if (this.viewer !== viewer || this.models.token(info.id) !== token) {
      throw cancelled();
    }
    await this.loadOne(viewer, source, doc);
    if (this.destroyed) {
      throw new ModelSetError('closed', VIEWER_CLOSED_MESSAGE);
    }
    if (this.viewer !== viewer || this.models.token(info.id) !== token) {
      throw cancelled();
    }
    const loaded = current();
    if (loaded.status === 'ready') this.frameModels(viewer);
    return loaded;
  }

  private openViewer(): GuiViewer3D {
    if (!this.viewer) throw new Error(VIEWER_CLOSED_MESSAGE);
    return this.viewer;
  }

  private ensureViewer(region: ViewerRegion): Promise<GuiViewer3D | null> {
    if (this.viewer) return Promise.resolve(this.viewer);
    if (!this.starting) {
      const starting = this.startViewer(region, this.epoch);
      this.starting = starting;
      const clear = () => {
        if (this.starting === starting) this.starting = null;
      };
      starting.then(clear, clear);
    }
    return this.starting;
  }

  private async startViewer(
    region: ViewerRegion,
    epoch: number,
  ): Promise<GuiViewer3D | null> {
    const superseded = () => this.destroyed || epoch !== this.epoch;
    await loadViewerAssets();
    if (superseded()) return null;
    await initializeViewing(region);
    if (superseded()) return null;
    const viewing = getViewing();
    const viewer = new viewing.GuiViewer3D(this.container, {
      extensions: ['Autodesk.DocumentBrowser', 'Autodesk.VisualClusters'],
    });
    this.selectionEvent =
      viewing.AGGREGATE_SELECTION_CHANGED_EVENT ??
      viewing.SELECTION_CHANGED_EVENT;
    viewer.addEventListener(this.selectionEvent, this.onSelection);
    let startCode: number | undefined;
    try {
      startCode = viewer.start();
    } catch (err) {
      this.abandon(viewer);
      throw err;
    }
    if (startCode) {
      this.abandon(viewer);
      throw new Error(`Viewer failed to start (${startCode})`);
    }
    this.viewer = viewer;
    this.started = true;
    this.api = apiForRegion(region);
    this.tagContainer(viewer);
    this.watchScreenMode(viewer, viewing.FULLSCREEN_MODE_EVENT);
    this.applyTheme(viewer);
    return viewer;
  }

  removeModel(modelId: string): void {
    const removed = this.models.remove(modelId);
    if (!removed) return;
    const viewer = this.viewer;
    const model = removed.handle;
    if (viewer && model) {
      viewer.clearThemingColors(model);
      viewer.unloadModel?.(model);
    }
    this.boxes.delete(modelId);
    if (model) this.placements.delete(model);
    if (modelId === this.anchorId || this.models.size === 0) {
      this.reanchor();
    }
    this.emitSelection();
  }

  private reanchor(): void {
    const ready = this.models.ready()[0];
    const loading = this.models
      .list()
      .some((model) => model.status === 'loading');
    if (!ready) {
      this.anchorId = null;
      if (!loading) this.anchor = null;
      return;
    }
    this.anchorId = ready.info.id;
    const next = anchorOf(ready.handle);
    this.anchor = {
      globalOffset: this.anchor?.globalOffset ?? next.globalOffset,
      unit: this.anchor?.unit ?? next.unit,
      is2d: next.is2d,
    };
  }

  getSpread(): ModelSpread | null {
    return this.placement.spread();
  }

  getTogetherOffsets(): Record<string, Vec3> {
    return this.placement.togetherOffsets();
  }

  setModelOffsets(offsets: Readonly<Record<string, Vec3>> | null): void {
    this.placement.set(offsets);
    const viewer = this.viewer;
    if (!viewer) return;
    this.frameModels(viewer);
  }

  private place(
    viewer: GuiViewer3D,
    model: ViewerModel,
    offset: Vec3 | undefined,
  ): void {
    const setPlacement = viewer.impl?.setPlacementTransform;
    let original = this.placements.get(model);
    if (!original) {
      if (!offset) return;
      original = model.getPlacementTransform?.()?.clone();
      if (!original) return;
      this.placements.set(model, original);
    }
    if (!setPlacement) return;
    const target = original.clone();
    if (offset) {
      target.elements[12] = (target.elements[12] ?? 0) + offset[0];
      target.elements[13] = (target.elements[13] ?? 0) + offset[1];
      target.elements[14] = (target.elements[14] ?? 0) + offset[2];
    }
    setPlacement.call(viewer.impl, model, target);
  }

  private frameModels(viewer: GuiViewer3D): void {
    const spread = this.getSpread();
    const together = this.placement.together;
    const anchor = this.anchorId
      ? this.models.handle(this.anchorId)
      : undefined;
    const box = anchor?.getBoundingBox?.();
    if (spread?.farApart && !together && box && viewer.navigation) {
      viewer.navigation.fitBounds(false, box);
      return;
    }
    viewer.fitToView?.();
  }

  getModels(): ModelInfo[] {
    return this.models.list();
  }

  async getGeometryParts(): Promise<GeometryRead> {
    const viewer = this.viewer;
    if (!viewer || this.destroyed) throw new Error(VIEWER_CLOSED_MESSAGE);
    const names = new Map<ViewerModel, string>();
    for (const { info, handle } of this.models.ready()) {
      if (info.visible) names.set(handle, info.name);
    }
    return readViewerGeometry(viewer, names);
  }

  async getIfcSource(): Promise<IfcSourceRead> {
    const viewer = this.viewer;
    if (!viewer || this.destroyed) throw new Error(VIEWER_CLOSED_MESSAGE);
    const shown = new Map<ViewerModel, SourceModelMeta>();
    for (const { info, handle } of this.models.shown()) {
      shown.set(handle, { id: info.id, name: info.name, urn: info.urn });
    }
    return readViewerSource(viewer, shown);
  }

  setModelVisible(modelId: string, visible: boolean): void {
    if (!this.models.setVisible(modelId, visible)) return;
    const viewer = this.viewer;
    const model = this.models.handle(modelId);
    if (!viewer || !model) return;
    if (visible) {
      viewer.showModel?.(model, true);
    } else {
      viewer.select?.([], model);
      viewer.hideModel?.(model);
    }
    this.emitSelection();
  }

  onModelsChange(cb: (models: ModelInfo[]) => void): () => void {
    return this.models.onChange(cb);
  }

  getModelSelection(): ModelDbId[] {
    const viewer = this.viewer;
    if (!viewer) return [];
    const shown = (modelId: string | undefined): modelId is string =>
      modelId !== undefined && this.models.get(modelId)?.visible === true;
    if (viewer.getAggregateSelection) {
      return viewer.getAggregateSelection().flatMap(({ model, selection }) => {
        const modelId = this.models.idOf(model);
        return shown(modelId)
          ? selection.map((dbId) => ({ modelId, dbId }))
          : [];
      });
    }
    const primary = this.models.primaryId();
    if (!shown(primary)) return [];
    return viewer.getSelection().map((dbId) => ({ modelId: primary, dbId }));
  }

  getModelWeight(modelId: string): number | null {
    return this.models.handle(modelId)?.getFragmentList?.().getCount() ?? null;
  }

  getIsolated(): ModelDbId[] {
    const viewer = this.viewer;
    if (!viewer?.getIsolatedNodes) return [];
    return this.models
      .shown()
      .flatMap(
        ({ info, handle }) =>
          viewer
            .getIsolatedNodes?.(handle)
            .map((dbId) => ({ modelId: info.id, dbId })) ?? [],
      );
  }

  async getVisible(): Promise<ModelDbId[]> {
    const viewer = this.viewer;
    if (!viewer) return [];
    const perModel = await Promise.all(
      this.models.shown().map(async ({ info, handle }) => {
        const tree = await readTree(viewer, handle);
        const isolated = viewer.getIsolatedNodes?.(handle) ?? [];
        const hidden = withDescendants(
          tree,
          viewer.getHiddenNodes?.(handle) ?? [],
        );
        const base =
          isolated.length > 0
            ? [...withDescendants(tree, isolated)]
            : leafIds(tree);
        return base
          .filter((dbId) => tree.getChildCount(dbId) === 0 && !hidden.has(dbId))
          .map((dbId) => ({ modelId: info.id, dbId }));
      }),
    );
    return perModel.flat();
  }

  selectModelIds(items: readonly ModelDbId[]): void {
    const viewer = this.viewer;
    if (!viewer?.select) return;
    const byModel = groupByModel(items);
    const entries = this.models
      .shown()
      .filter(({ info }) => byModel.has(info.id))
      .map(({ info, handle }) => ({
        model: handle,
        ids: byModel.get(info.id) ?? [],
      }));
    const selector = viewer.impl?.selector;
    if (selector?.setAggregateSelection) {
      if (entries.length === 0) viewer.clearSelection();
      else selector.setAggregateSelection(entries);
      return;
    }
    for (const { info, handle } of this.models.shown()) {
      viewer.select(byModel.get(info.id) ?? [], handle);
    }
  }

  isolateModelIds(items: readonly ModelDbId[]): void {
    const viewer = this.viewer;
    if (!viewer?.isolate) return;
    const byModel = groupByModel(items);
    for (const { info, handle } of this.models.shown()) {
      const ids = byModel.get(info.id);
      if (ids) viewer.isolate(ids, handle);
      else viewer.isolate(items.length === 0 ? [] : [HIDE_ALL_NODE], handle);
    }
  }

  hideModelIds(items: readonly ModelDbId[]): void {
    const viewer = this.viewer;
    if (!viewer?.hide) return;
    const byModel = groupByModel(items);
    for (const { info, handle } of this.models.shown()) {
      const ids = byModel.get(info.id);
      if (ids) viewer.hide(ids, handle);
    }
  }

  showAll(): void {
    const viewer = this.viewer;
    if (viewer) resetNodes(viewer, this.stateModels());
  }

  fitToView(items?: readonly ModelDbId[]): void {
    const viewer = this.viewer;
    if (!viewer?.fitToView) return;
    if (!items || items.length === 0) {
      viewer.fitToView();
      return;
    }
    const byModel = groupByModel(items);
    const targets = this.models
      .shown()
      .filter(({ info }) => byModel.has(info.id));
    const [only] = targets;
    if (targets.length === 1 && only) {
      viewer.fitToView(byModel.get(only.info.id), only.handle, false);
      return;
    }
    if (targets.length === 0) return;
    this.selectModelIds(items);
    viewer.fitToView();
  }

  getState(): ViewerState {
    const viewer = this.viewer;
    if (!viewer) return { version: 1, camera: null, cutplanes: [], models: {} };
    return captureViewerState(
      viewer,
      this.stateModels(),
      this.getModelSelection(),
    );
  }

  async restoreState(state: ViewerState): Promise<void> {
    const viewer = this.viewer;
    if (!viewer) return;
    const selection = await restoreViewerState(
      viewer,
      this.stateModels(),
      state,
    );
    if (this.viewer === viewer) this.selectModelIds(selection);
  }

  private stateModels(): { id: string; handle: ViewerModel }[] {
    return this.models
      .shown()
      .map(({ info, handle }) => ({ id: info.id, handle }));
  }

  getScreenshot(): Promise<Blob> {
    const viewer = this.viewer;
    const frame = viewer?.container;
    if (!viewer?.getScreenShot || !frame) {
      return Promise.reject(new Error('The viewer cannot take a snapshot'));
    }
    return new Promise<Blob>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('The snapshot timed out')),
        SCREENSHOT_TIMEOUT_MS,
      );
      viewer.getScreenShot?.(frame.clientWidth, frame.clientHeight, (url) => {
        clearTimeout(timer);
        fetch(url)
          .then((response) => response.blob())
          .then(resolve, reject);
      });
    });
  }

  getCamera(): CameraState | null {
    return this.viewer ? readCamera(this.viewer) : null;
  }

  setCamera(camera: CameraState): void {
    if (this.viewer) applyCamera(this.viewer, camera);
  }

  setModelThemingColor(items: readonly ModelDbId[], color: Rgba): void {
    const viewer = this.viewer;
    const THREE = autodeskWindow().THREE;
    if (!viewer || !THREE) return;
    const vector = new THREE.Vector4(color[0], color[1], color[2], color[3]);
    for (const { modelId, dbId } of items) {
      const model = this.models.handle(modelId);
      if (model) viewer.setThemingColor(dbId, vector, model);
    }
  }

  private fetchDocument(urn: string): Promise<ViewingDocument> {
    const promise =
      apiForRegion(detectRegion(urn)) === this.api
        ? loadDocument(urn)
        : Promise.reject(new ModelLoadError('region', OTHER_REGION_MESSAGE));
    promise.catch(() => {});
    return promise;
  }

  private async loadSet(
    viewer: GuiViewer3D,
    sources: readonly ModelSource[],
  ): Promise<void> {
    const docs = new Map(
      sources.map((source) => [source.urn, this.fetchDocument(source.urn)]),
    );
    const pending = [...sources];
    while (!this.anchor && pending.length > 0) {
      const source = pending.shift();
      const doc = source && docs.get(source.urn);
      if (!source || !doc) continue;
      await this.loadOne(viewer, source, doc);
      if (this.destroyed || this.viewer !== viewer) return;
    }
    await Promise.all(
      pending.map((source) => {
        const doc = docs.get(source.urn);
        return doc ? this.loadOne(viewer, source, doc) : Promise.resolve();
      }),
    );
    if (this.destroyed || this.viewer !== viewer) return;
    if (this.models.ready().length > 1) this.frameModels(viewer);
  }

  private async loadOne(
    viewer: GuiViewer3D,
    source: ModelSource,
    docPromise: Promise<ViewingDocument>,
  ): Promise<void> {
    const id = modelIdFor(source.urn);
    const token = this.models.token(id);
    const stale = () =>
      this.destroyed ||
      this.viewer !== viewer ||
      token === undefined ||
      this.models.token(id) !== token;
    let release: (() => void) | null = null;
    try {
      if (apiForRegion(detectRegion(source.urn)) !== this.api) {
        throw new ModelLoadError('region', OTHER_REGION_MESSAGE);
      }
      this.emitStage('manifest');
      const doc = await docPromise;
      if (stale()) return;
      while (!this.anchor && this.anchoring) {
        await this.anchoring;
        if (stale()) return;
      }
      if (!this.anchor) {
        let done = () => {};
        const anchoring = new Promise<void>((resolve) => {
          done = resolve;
        });
        this.anchoring = anchoring;
        release = () => {
          if (this.anchoring === anchoring) this.anchoring = null;
          done();
        };
      }
      const node = pickGeometryNode(doc, this.anchor);
      this.emitStage('geometry');
      const model = await viewer.loadDocumentNode(
        doc,
        node,
        federatedLoadOptions(this.anchor),
      );
      if (this.destroyed || this.viewer !== viewer) return;
      if (!this.models.resolve(id, model, token)) {
        viewer.unloadModel?.(model);
        return;
      }
      if (!this.anchor) {
        this.anchor = anchorOf(model);
        this.anchorId = id;
      } else if (!this.anchorId) {
        this.anchorId = id;
      }
      const box = model.getBoundingBox?.();
      if (box) {
        this.boxes.set(id, {
          id,
          min: [box.min.x, box.min.y, box.min.z],
          max: [box.max.x, box.max.y, box.max.z],
        });
      }
      const offset = this.placement.offsetOf(id);
      if (offset) this.place(viewer, model, offset);
      release?.();
      release = null;
      if (!this.models.get(id)?.visible) viewer.hideModel?.(model);
      if (!this.modelLoaded) {
        this.applyTheme(viewer);
        this.modelLoaded = true;
        await this.syncTools();
        this.resize();
      }
    } catch (err) {
      if (this.destroyed || this.viewer !== viewer) return;
      this.models.fail(id, errorMessage(err), token, reasonOf(err));
    } finally {
      release?.();
    }
  }

  private tagContainer(viewer: GuiViewer3D): void {
    this.container.dataset.bshViewer = '';
    (this.container as TaggedContainer).bshViewer = viewer;
  }

  private untagContainer(): void {
    delete this.container.dataset.bshViewer;
    delete (this.container as TaggedContainer).bshViewer;
  }

  private emitSelection(): void {
    this.selection.emit(this.getModelSelection());
  }

  resize(): void {
    const viewer = this.viewer;
    if (!viewer) return;
    const frame = this.frame();
    const width = frame.clientWidth;
    const height = frame.clientHeight;
    if (width === 0 || height === 0) return;
    for (const el of this.container.querySelectorAll<HTMLElement>(
      '.adsk-viewing-viewer',
    )) {
      if (el.parentElement !== this.container) continue;
      if (el.style.width.endsWith('px')) el.style.width = '';
      if (el.style.height.endsWith('px')) el.style.height = '';
    }
    viewer.resize();
    const canvas = viewer.canvas;
    if (
      canvas &&
      (canvas.clientWidth !== width || canvas.clientHeight !== height)
    ) {
      viewer.impl?.resize?.(width, height);
    }
  }

  unload(): void {
    this.epoch += 1;
    this.starting = null;
    this.models.clear();
    this.anchor = null;
    this.anchoring = null;
    this.anchorId = null;
    this.boxes.clear();
    this.placements.clear();
    this.placement.reset();
    this.settling = Promise.resolve();
    const viewer = this.viewer;
    if (!viewer) return;
    const viewing = autodeskWindow().Autodesk?.Viewing;
    if (viewing) {
      viewer.removeEventListener(
        this.selectionEvent || viewing.SELECTION_CHANGED_EVENT,
        this.onSelection,
      );
      if (viewing.FULLSCREEN_MODE_EVENT) {
        viewer.removeEventListener(
          viewing.FULLSCREEN_MODE_EVENT,
          this.onScreenChange,
        );
      }
    }
    this.unwatchScreenMode();
    this.untagContainer();
    this.mountedController = null;
    this.modelLoaded = false;
    this.controller?.resetState();
    this.viewer = null;
    if (!this.started) {
      this.removeFrame(viewer);
      return;
    }
    this.started = false;
    viewer.tearDown();
    viewer.finish();
  }

  private abandon(viewer: GuiViewer3D): void {
    const viewing = autodeskWindow().Autodesk?.Viewing;
    if (viewing) {
      viewer.removeEventListener(
        this.selectionEvent || viewing.SELECTION_CHANGED_EVENT,
        this.onSelection,
      );
    }
    if (this.viewer === viewer) this.viewer = null;
    this.removeFrame(viewer);
  }

  private removeFrame(viewer: GuiViewer3D): void {
    const frame = viewer.container;
    if (frame && frame !== this.container && frame.parentNode) {
      frame.parentNode.removeChild(frame);
    }
  }

  clearSelection(): void {
    this.viewer?.clearSelection();
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    if (this.viewer) this.applyTheme(this.viewer);
  }

  private applyTheme(viewer: GuiViewer3D): void {
    viewer.setTheme(VIEWER_THEMES[this.theme]);
    viewer.setBackgroundColor(...readSceneBackground());
  }

  clearThemingColors(): void {
    const viewer = this.viewer;
    if (!viewer) return;
    const ready = this.models.ready();
    if (ready.length === 0) {
      viewer.clearThemingColors();
      return;
    }
    for (const { handle } of ready) viewer.clearThemingColors(handle);
  }

  getLeafProperties(
    propertyNames: string[],
    modelIds?: readonly string[],
    options: ReadOptions = {},
  ): Promise<PropertyRow[]> {
    if (!this.viewer) return Promise.resolve([]);
    return this.reader.rows(propertyNames, modelIds, options);
  }

  discoverProperties(
    modelIds?: readonly string[],
    options: ReadOptions = {},
  ): Promise<PropertyInfo[]> {
    if (!this.viewer) return Promise.resolve([]);
    return this.reader.infos(modelIds, options);
  }

  private async readModelInfos(
    viewer: GuiViewer3D,
    model: ViewerModel,
    options: ReadOptions,
  ): Promise<PropertyInfo[]> {
    const tree = await readTree(viewer, model);
    throwIfAborted(options.signal);
    const items = await new Promise<BulkPropertyItem[]>((resolve, reject) =>
      model.getBulkProperties(
        sampleIds(leafIds(tree), DISCOVERY_SAMPLE),
        {},
        resolve,
        reject,
      ),
    );
    throwIfAborted(options.signal);
    return mergeInfos([
      items.flatMap((item) =>
        item.properties.map((prop) => ({
          name: prop.displayName,
          category: prop.displayCategory?.trim() || UNCATEGORIZED,
        })),
      ),
    ]);
  }

  private async readModelRows(
    viewer: GuiViewer3D,
    model: ViewerModel,
    propertyNames: string[],
    options: ReadOptions,
  ): Promise<PropertyRow[]> {
    const tree = await readTree(viewer, model);
    throwIfAborted(options.signal);
    const ids = leafIds(tree);
    const items = await readInChunks(
      ids,
      (chunk) =>
        new Promise<BulkPropertyItem[]>((resolve, reject) =>
          model.getBulkProperties(
            chunk,
            { propFilter: propertyNames },
            resolve,
            reject,
          ),
        ),
      options,
    );
    return items.map((item) => {
      const properties: PropertyRow['properties'] = {};
      for (const name of propertyNames) properties[name] = null;
      for (const prop of item.properties) {
        if (properties[prop.displayName] === null) {
          properties[prop.displayName] = toPropertyValue(prop.displayValue);
        }
      }
      return { dbId: item.dbId, name: item.name, properties };
    });
  }

  registerToolGroup(spec: ToolGroupSpec): () => void {
    this.controller?.dispose();
    const controller = new ToolGroupController(spec, this);
    this.controller = controller;
    void this.syncTools().catch(() => undefined);
    return () => {
      if (this.controller !== controller) return;
      controller.dispose();
      this.controller = null;
      void this.syncTools().catch(() => undefined);
    };
  }

  onSelectionChange(cb: (items: ModelDbId[]) => void): () => void {
    return this.selection.subscribe(cb);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unload();
    this.controller?.dispose();
    this.controller = null;
    this.selection.clear();
    this.models.dispose();
  }

  private document(): Document {
    return this.container.ownerDocument;
  }

  private frame(): HTMLElement {
    const active = fullscreenElementOf(this.document());
    if (
      active instanceof HTMLElement &&
      active !== this.container &&
      this.container.contains(active)
    ) {
      return active;
    }
    return this.container;
  }

  private watchScreenMode(viewer: GuiViewer3D, modeEvent?: string): void {
    this.unwatchScreenMode();
    if (modeEvent) viewer.addEventListener(modeEvent, this.onScreenChange);
    this.stopFullscreen = watchFullscreen(
      this.document(),
      this.onFullscreenChange,
      this.onFullscreenError,
    );
    if (viewer.container && typeof ResizeObserver !== 'undefined') {
      this.frameObserver = new ResizeObserver(this.onScreenChange);
      this.frameObserver.observe(viewer.container);
    }
  }

  private unwatchScreenMode(): void {
    this.stopFullscreen?.();
    this.stopFullscreen = null;
    this.frameObserver?.disconnect();
    this.frameObserver = null;
    this.resizer.cancel();
  }

  scheduleResize(settleMs: number): void {
    this.resizer.schedule(settleMs);
  }

  private syncTools(): Promise<void> {
    const run = this.toolsChain.then(() => this.reconcileTools());
    this.toolsChain = run.catch(() => undefined);
    return run;
  }

  private async reconcileTools(): Promise<void> {
    const viewer = this.viewer;
    const wanted = viewer && this.modelLoaded ? this.controller : null;
    if (this.mountedController === wanted) return;
    if (this.mountedController) {
      this.mountedController = null;
      viewer?.unloadExtension(TOOLS_EXTENSION_ID);
    }
    if (!viewer || !wanted) return;
    ensureToolsExtension();
    this.mountedController = wanted;
    try {
      await viewer.loadExtension(TOOLS_EXTENSION_ID, { controller: wanted });
    } catch {
      if (this.mountedController === wanted) this.mountedController = null;
    }
  }
}

export async function createRealViewerAdapter(
  container: HTMLElement,
): Promise<ViewerAdapter> {
  return new RealViewerAdapter(container);
}
