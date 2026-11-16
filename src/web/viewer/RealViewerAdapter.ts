import type { PropertyRow } from '../../shared/types.js';
import { notifyUnauthorized } from '../api/client.js';
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
  type FederationAnchor,
  federatedLoadOptions,
  OTHER_REGION_MESSAGE,
  pickGeometryNode,
} from './federation.js';
import { fullscreenElementOf, watchFullscreen } from './fullscreen.js';
import { tagRows } from './modelScope.js';
import {
  CANCELLED_MESSAGE,
  checkCapacity,
  loadFailureMessage,
  type ModelBox,
  type ModelDbId,
  type ModelInfo,
  ModelSet,
  ModelSetError,
  type ModelSource,
  type ModelSpread,
  metersPerUnit,
  modelIdFor,
  spreadOf,
  togetherOffsets,
  uniqueSources,
  type Vec3,
  VIEWER_CLOSED_MESSAGE,
} from './modelSet.js';
import {
  apiForRegion,
  claimRegion,
  detectRegion,
  RegionConflictError,
  type ViewerRegion,
} from './region.js';
import { createResizeScheduler } from './resizeScheduler.js';
import { readSceneBackground } from './sceneBackground.js';
import { ToolGroupController } from './toolGroupController.js';
import type { Rgba, ToolGroupSpec, ViewerAdapter } from './ViewerAdapter.js';

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

export {
  apiForRegion,
  detectRegion,
  type ViewerRegion,
} from './region.js';

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
      reject(new Error(`Document load failed (${code}): ${message}`)),
    );
  });
}

function propertiesMessage(err: unknown): string {
  return err instanceof Error && err.message
    ? `Properties could not be read: ${err.message}`
    : 'Properties could not be read';
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

export class RealViewerAdapter implements ViewerAdapter {
  private viewer: GuiViewer3D | null = null;
  private destroyed = false;
  private theme: Theme = 'dark';
  private readonly selectionListeners = new Set<(items: ModelDbId[]) => void>();
  private controller: ToolGroupController | null = null;
  private toolsMounted = false;
  private modelLoaded = false;
  private started = false;
  private stopFullscreen: (() => void) | null = null;
  private frameObserver: ResizeObserver | null = null;
  private readonly models = new ModelSet<ViewerModel>();
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
  private offsets: Record<string, Vec3> | null = null;
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

  async load(urn: string, name?: string): Promise<void> {
    await this.loadModels([name ? { urn, name } : { urn }]);
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
    try {
      viewer = await this.ensureViewer(region);
    } catch (err) {
      if (!this.destroyed) {
        for (const { id, token } of entries) {
          this.models.fail(id, errorMessage(err), token);
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
      throw new Error(loadFailureMessage(models));
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
      this.models.fail(info.id, errorMessage(err), token);
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
    if (this.models.size === 0) {
      this.anchor = null;
      this.anchorId = null;
    }
    this.emitSelection();
  }

  getSpread(): ModelSpread | null {
    const ready = new Set(this.models.ready().map(({ info }) => info.id));
    const boxes = [...this.boxes.values()].filter((box) => ready.has(box.id));
    return spreadOf(boxes, metersPerUnit(this.anchor?.unit));
  }

  getTogetherOffsets(): Record<string, Vec3> {
    const ready = new Set(this.models.ready().map(({ info }) => info.id));
    const boxes = [...this.boxes.values()].filter((box) => ready.has(box.id));
    const anchorId =
      this.anchorId && ready.has(this.anchorId) ? this.anchorId : boxes[0]?.id;
    return anchorId ? togetherOffsets(boxes, anchorId) : {};
  }

  setModelOffsets(offsets: Readonly<Record<string, Vec3>> | null): void {
    this.offsets = offsets ? { ...offsets } : null;
    const viewer = this.viewer;
    if (!viewer) return;
    for (const { info, handle } of this.models.ready()) {
      this.place(viewer, handle, this.offsets?.[info.id]);
    }
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
    const together = Boolean(
      this.offsets && Object.keys(this.offsets).length > 0,
    );
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
        : Promise.reject(new Error(OTHER_REGION_MESSAGE));
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
        throw new Error(OTHER_REGION_MESSAGE);
      }
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
      }
      const box = model.getBoundingBox?.();
      if (box) {
        this.boxes.set(id, {
          id,
          min: [box.min.x, box.min.y, box.min.z],
          max: [box.max.x, box.max.y, box.max.z],
        });
      }
      const offset = this.offsets?.[id];
      if (offset) this.place(viewer, model, offset);
      release?.();
      release = null;
      if (!this.models.get(id)?.visible) viewer.hideModel?.(model);
      if (!this.modelLoaded) {
        this.applyTheme(viewer);
        this.modelLoaded = true;
        await this.mountTools();
        this.resize();
      }
    } catch (err) {
      if (this.destroyed || this.viewer !== viewer) return;
      this.models.fail(id, errorMessage(err), token);
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
    const items = this.getModelSelection();
    for (const cb of [...this.selectionListeners]) {
      try {
        cb(items.map((item) => ({ ...item })));
      } catch (err) {
        console.error(err);
      }
    }
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
    this.offsets = null;
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
    this.toolsMounted = false;
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

  async getLeafProperties(
    propertyNames: string[],
    modelIds?: readonly string[],
  ): Promise<PropertyRow[]> {
    const viewer = this.viewer;
    if (!viewer) return [];
    const shown = this.models
      .shown()
      .filter(({ info }) => !modelIds || modelIds.includes(info.id));
    const results = await Promise.allSettled(
      shown.map(async ({ info, handle }) =>
        tagRows(await this.readModelRows(viewer, handle, propertyNames), info),
      ),
    );
    const rows: PropertyRow[] = [];
    let failure: unknown = null;
    results.forEach((result, index) => {
      const id = shown[index]?.info.id;
      if (id === undefined) return;
      if (result.status === 'fulfilled') {
        rows.push(...result.value);
        this.models.setPropertiesError(id);
      } else {
        failure ??= result.reason;
        this.models.setPropertiesError(id, propertiesMessage(result.reason));
      }
    });
    if (failure !== null && rows.length === 0) throw failure;
    return rows;
  }

  private async readModelRows(
    viewer: GuiViewer3D,
    model: ViewerModel,
    propertyNames: string[],
  ): Promise<PropertyRow[]> {
    const tree = await readTree(viewer, model);
    const ids = leafIds(tree);
    const items = await new Promise<BulkPropertyItem[]>((resolve, reject) =>
      model.getBulkProperties(
        ids,
        { propFilter: propertyNames },
        resolve,
        reject,
      ),
    );
    return items.map((item) => {
      const properties: PropertyRow['properties'] = {};
      for (const name of propertyNames) properties[name] = null;
      for (const prop of item.properties) {
        properties[prop.displayName] = toPropertyValue(prop.displayValue);
      }
      return { dbId: item.dbId, name: item.name, properties };
    });
  }

  registerToolGroup(spec: ToolGroupSpec): () => void {
    this.controller?.dispose();
    const controller = new ToolGroupController(spec, this);
    this.controller = controller;
    void this.mountTools();
    return () => {
      if (this.controller !== controller) return;
      this.unmountTools();
      controller.dispose();
      this.controller = null;
    };
  }

  onSelectionChange(cb: (items: ModelDbId[]) => void): () => void {
    this.selectionListeners.add(cb);
    return () => {
      this.selectionListeners.delete(cb);
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unload();
    this.controller?.dispose();
    this.controller = null;
    this.selectionListeners.clear();
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

  private async mountTools(): Promise<void> {
    const viewer = this.viewer;
    const controller = this.controller;
    if (!viewer || !controller || !this.modelLoaded || this.toolsMounted) {
      return;
    }
    ensureToolsExtension();
    this.toolsMounted = true;
    try {
      await viewer.loadExtension(TOOLS_EXTENSION_ID, { controller });
    } catch {
      this.toolsMounted = false;
    }
  }

  private unmountTools(): void {
    if (!this.toolsMounted) return;
    this.toolsMounted = false;
    this.viewer?.unloadExtension(TOOLS_EXTENSION_ID);
  }
}

export async function createRealViewerAdapter(
  container: HTMLElement,
): Promise<ViewerAdapter> {
  return new RealViewerAdapter(container);
}
