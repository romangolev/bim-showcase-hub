import type { PropertyRow } from '../../shared/types.js';
import { notifyUnauthorized } from '../api/client.js';
import type { IfcSourceRead } from '../ifc/types.js';
import type { Theme } from '../theme/theme.js';
import {
  type AutodeskViewing,
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
import { colorLayersFor, resetColorLayers } from './colorLayers.js';
import {
  anchorOf,
  documentLoadError,
  type FederationAnchor,
  federatedLoadOptions,
  nodeGuid,
  nodeName,
  nodeRole,
  OTHER_REGION_MESSAGE,
  pickGeometryNode,
} from './federation.js';
import { fullscreenElementOf, watchFullscreen } from './fullscreen.js';
import type { GeometryRead } from './geometryTypes.js';
import {
  MEASURE_EXTENSION_ID,
  type MeasureExtensionLike,
  toMeasurements,
} from './measurements.js';
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
import { NATIVE_CONTROLS, TOOLBAR_GROUPS } from './nativeControls.js';
import { Placement, type PlacementInfo } from './placement.js';
import { PropertyReader } from './propertyReader.js';
import {
  type ElementProperties,
  mergeInfos,
  type PropertyInfo,
  type ReadOptions,
  readInChunks,
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
  DisplaySettings,
  LoadStage,
  MeasureMode,
  MeasurementInfo,
  RestoreReport,
  Rgba,
  ToolGroupSpec,
  ViewerAdapter,
  ViewerState,
  ViewNode,
} from './ViewerAdapter.js';
import { NOTHING_SKIPPED } from './ViewerAdapter.js';
import { readViewerGeometry } from './viewerGeometry.js';
import { readViewerSource, type SourceModelMeta } from './viewerSource.js';
import {
  applyCamera,
  captureViewerState,
  HIDE_ALL_NODE,
  readCamera,
  readTree,
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
    tree.enumNodeChildren(
      id,
      (child) => {
        all.add(child);
      },
      true,
    );
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

function visibilityEvents(viewing: {
  HIDE_EVENT?: string;
  SHOW_EVENT?: string;
  ISOLATE_EVENT?: string;
}): string[] {
  return [viewing.HIDE_EVENT, viewing.SHOW_EVENT, viewing.ISOLATE_EVENT].filter(
    (event): event is string => typeof event === 'string',
  );
}

function measureEvents(viewing: AutodeskViewing): string[] {
  const events = viewing.MeasureCommon?.Events;
  return [
    events?.MEASUREMENT_COMPLETED_EVENT,
    events?.DELETE_MEASUREMENT_EVENT,
  ].filter((event): event is string => typeof event === 'string');
}

function sharedCoordinatesOf(model: ViewerModel | undefined): boolean | null {
  if (!model?.getData) return null;
  const data = model.getData();
  if (!data || typeof data !== 'object') return null;
  return data.refPointTransform !== undefined;
}

const SCREENSHOT_TIMEOUT_MS = 10_000;

export class RealViewerAdapter implements ViewerAdapter {
  private viewer: GuiViewer3D | null = null;
  private destroyed = false;
  private theme: Theme = 'dark';
  private readonly stageListeners = new Set<(stage: LoadStage) => void>();
  private readonly selection = new SelectionHub();
  private readonly visibility = new SelectionHub();
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
  private measureEventIds: string[] = [];
  private hiddenControls: readonly string[] = [];
  private displaySettings: DisplaySettings | null = null;
  private readonly measureListeners = new Set<() => void>();
  private readonly documents = new Map<string, ViewingDocument>();
  private readonly loadedNodes = new Map<string, unknown>();
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
  private readonly onVisibility = () => {
    this.visibility.emit([]);
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
  private readonly onMeasureChange = () => {
    this.emitMeasurements();
  };
  private readonly onToolbarCreated = () => {
    const viewer = this.viewer;
    if (viewer) this.applyHiddenControls(viewer);
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
    for (const event of visibilityEvents(viewing)) {
      viewer.addEventListener(event, this.onVisibility);
    }
    this.measureEventIds = measureEvents(viewing);
    for (const event of this.measureEventIds) {
      viewer.addEventListener(event, this.onMeasureChange);
    }
    viewer.addEventListener(
      viewing.TOOLBAR_CREATED_EVENT,
      this.onToolbarCreated,
    );
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
    colorLayersFor(this).forgetModel(modelId);
    this.boxes.delete(modelId);
    this.documents.delete(modelId);
    this.loadedNodes.delete(modelId);
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

  getPlacementInfo(): PlacementInfo[] {
    return this.placement.info(
      (modelId) => this.models.handle(modelId)?.getUnitString?.() || null,
      (modelId) => sharedCoordinatesOf(this.models.handle(modelId)),
    );
  }

  listMeasurements(): MeasurementInfo[] {
    return toMeasurements(this.measure()?.getMeasurementList?.());
  }

  async startMeasure(mode: MeasureMode): Promise<boolean> {
    const viewer = this.viewer;
    if (!viewer) return false;
    const loaded =
      this.measure() ??
      ((await viewer
        .loadExtension(MEASURE_EXTENSION_ID)
        .catch(() => null)) as MeasureExtensionLike | null);
    return loaded?.activate?.(mode) === true;
  }

  clearMeasurements(): void {
    this.measure()?.deleteMeasurements?.();
    this.emitMeasurements();
  }

  onMeasurementsChange(cb: () => void): () => void {
    this.measureListeners.add(cb);
    return () => {
      this.measureListeners.delete(cb);
    };
  }

  private measure(): MeasureExtensionLike | null {
    const extension = this.viewer?.getExtension?.(MEASURE_EXTENSION_ID);
    return extension && typeof extension === 'object'
      ? (extension as MeasureExtensionLike)
      : null;
  }

  private emitMeasurements(): void {
    for (const cb of [...this.measureListeners]) cb();
  }

  setHiddenControls(ids: readonly string[]): string[] {
    this.hiddenControls = [...ids];
    const viewer = this.viewer;
    return viewer ? this.applyHiddenControls(viewer) : [];
  }

  private applyHiddenControls(viewer: GuiViewer3D): string[] {
    const toolbar = viewer.toolbar;
    if (!toolbar) return [];
    const hidden = new Set(this.hiddenControls);
    const ids = [
      ...new Set([
        ...NATIVE_CONTROLS.map((control) => control.id as string),
        ...this.hiddenControls,
      ]),
    ];
    const found = new Set<string>();
    for (const groupId of TOOLBAR_GROUPS) {
      const group = toolbar.getControl(groupId);
      if (!group?.getControl) continue;
      for (const id of ids) {
        const control = group.getControl(id);
        if (!control) continue;
        found.add(id);
        control.setVisible?.(!hidden.has(id));
      }
    }
    return this.hiddenControls.filter((id) => !found.has(id));
  }

  applyDisplaySettings(settings: DisplaySettings): string[] {
    this.displaySettings = { ...settings };
    const viewer = this.viewer;
    return viewer ? this.applyDisplay(viewer, settings) : [];
  }

  private applyDisplay(
    viewer: GuiViewer3D,
    settings: DisplaySettings,
  ): string[] {
    const missing: string[] = [];
    if (settings.lightPreset !== null) {
      if (viewer.setLightPreset) {
        viewer.setLightPreset(settings.lightPreset);
        this.applyTheme(viewer);
      } else {
        missing.push('lightPreset');
      }
    }
    if (viewer.setGroundShadow) viewer.setGroundShadow(settings.groundShadow);
    else missing.push('groundShadow');
    if (viewer.setGroundReflection) {
      viewer.setGroundReflection(settings.groundReflection);
    } else {
      missing.push('groundReflection');
    }
    if (viewer.setDisplayEdges) viewer.setDisplayEdges(settings.edges);
    else missing.push('edges');
    if (viewer.setQualityLevel) {
      viewer.setQualityLevel(settings.ambientOcclusion, settings.antialiasing);
    } else {
      missing.push('ambientOcclusion', 'antialiasing');
    }
    if (viewer.setOptimizeNavigation) {
      viewer.setOptimizeNavigation(settings.performance);
    } else {
      missing.push('performance');
    }
    if (viewer.setProgressiveRendering) {
      viewer.setProgressiveRendering(!settings.performance);
    } else if (!missing.includes('performance')) {
      missing.push('performance');
    }
    return missing;
  }

  async listViews(modelId: string): Promise<ViewNode[]> {
    const doc = this.documents.get(modelId);
    if (!doc) return [];
    const loaded = this.loadedNodes.get(modelId);
    const currentId = nodeGuid(loaded);
    const nodes = doc.getRoot().search?.({ type: 'geometry' }) ?? [];
    const views: ViewNode[] = [];
    for (const node of nodes) {
      const id = nodeGuid(node);
      if (!id) continue;
      views.push({
        id,
        name: nodeName(node),
        role: nodeRole(node),
        current: currentId === undefined ? node === loaded : id === currentId,
      });
    }
    return views;
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

  async getElementsProperties(
    items: readonly ModelDbId[],
  ): Promise<(ElementProperties | null)[]> {
    const found = new Map<string, ElementProperties>();
    await Promise.all(
      [...groupByModel(items)].map(([modelId, dbIds]) => {
        const model = this.models.handle(modelId);
        if (!model) return Promise.resolve();
        return new Promise<void>((resolve, reject) =>
          model.getBulkProperties(
            dbIds,
            {},
            (list) => {
              for (const item of list) {
                found.set(`${modelId}:${item.dbId}`, {
                  dbId: item.dbId,
                  name: item.name,
                  properties: item.properties.map((prop) => ({
                    category: prop.displayCategory?.trim() || UNCATEGORIZED,
                    name: prop.displayName,
                    value: toPropertyValue(prop.displayValue),
                  })),
                });
              }
              resolve();
            },
            reject,
          ),
        );
      }),
    );
    return items.map(
      (item) => found.get(`${item.modelId}:${item.dbId}`) ?? null,
    );
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

  async getExternalIdMap(modelId: string): Promise<Record<string, number>> {
    const model = this.models.handle(modelId);
    const read = model?.getExternalIdMapping;
    if (!model || typeof read !== 'function') return {};
    try {
      return await new Promise<Record<string, number>>((resolve, reject) =>
        read.call(model, resolve, reject),
      );
    } catch {
      return {};
    }
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
        const isolatedNodes = viewer.getIsolatedNodes?.(handle) ?? [];
        const isolated = isolatedNodes.filter((id) => id !== HIDE_ALL_NODE);
        if (isolatedNodes.length > 0 && isolated.length === 0) return [];
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

  showModelIds(items: readonly ModelDbId[]): void {
    const viewer = this.viewer;
    if (!viewer?.show) return;
    const byModel = groupByModel(items);
    for (const { info, handle } of this.models.shown()) {
      const ids = byModel.get(info.id);
      if (ids) viewer.show(ids, handle);
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
    const previous = this.getModelSelection();
    this.selectModelIds(items);
    viewer.fitToView();
    this.selectModelIds(previous);
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

  async restoreState(state: ViewerState): Promise<RestoreReport> {
    const viewer = this.viewer;
    if (!viewer) return NOTHING_SKIPPED;
    const { selection, report } = await restoreViewerState(
      viewer,
      this.stateModels(),
      state,
    );
    if (this.viewer === viewer) this.selectModelIds(selection);
    return report;
  }

  private stateModels(): { id: string; handle: ViewerModel }[] {
    return this.models
      .shown()
      .map(({ info, handle }) => ({ id: info.id, handle }));
  }

  getScreenshot(width?: number, height?: number): Promise<Blob> {
    const viewer = this.viewer;
    const frame = viewer?.container;
    if (!viewer?.getScreenShot || !frame) {
      return Promise.reject(new Error('The viewer cannot take a snapshot'));
    }
    return new Promise<Blob>((resolve, reject) => {
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        reject(new Error('The snapshot timed out'));
      }, SCREENSHOT_TIMEOUT_MS);
      viewer.getScreenShot?.(
        width ?? frame.clientWidth,
        height ?? frame.clientHeight,
        (url) => {
          clearTimeout(timer);
          if (timedOut) {
            URL.revokeObjectURL(url);
            return;
          }
          fetch(url)
            .then((response) => response.blob())
            .finally(() => URL.revokeObjectURL(url))
            .then(resolve, reject);
        },
      );
    });
  }

  getCamera(): CameraState | null {
    return this.viewer ? readCamera(this.viewer) : null;
  }

  setCamera(camera: CameraState): void {
    if (this.viewer) applyCamera(this.viewer, camera);
  }

  setModelThemingColor(items: readonly ModelDbId[], color: Rgba): void {
    const THREE = autodeskWindow().THREE;
    if (!this.viewer || !THREE) return;
    const vector = new THREE.Vector4(color[0], color[1], color[2], color[3]);
    this.applyTheming(items, vector, true);
  }

  clearModelThemingColors(items: readonly ModelDbId[]): void {
    if (!this.viewer) return;
    this.applyTheming(items, null, false);
  }

  private applyTheming(
    items: readonly ModelDbId[],
    color: unknown,
    defer: boolean,
  ): void {
    const viewer = this.viewer;
    if (!viewer) return;
    let deferred = false;
    for (const { modelId, dbId } of items) {
      const model = this.models.handle(modelId);
      if (!model) continue;
      if (defer && typeof model.setThemingColor === 'function') {
        model.setThemingColor(dbId, color);
        deferred = true;
      } else {
        viewer.setThemingColor(dbId, color, model);
      }
    }
    if (deferred) viewer.impl?.invalidate?.(true);
  }

  setGhosting(enabled: boolean): void {
    const viewer = this.viewer as
      | (GuiViewer3D & { setGhosting?(value: boolean): void })
      | null;
    const ghost = viewer?.setGhosting;
    if (!viewer || typeof ghost !== 'function') return;
    try {
      ghost.call(viewer, enabled);
    } catch {
      return;
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
      const node = pickGeometryNode(doc, this.anchor, source.view);
      this.documents.set(id, doc);
      this.loadedNodes.set(id, node);
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
      this.applyHiddenControls(viewer);
      if (!this.modelLoaded) {
        this.applyTheme(viewer);
        this.modelLoaded = true;
        await this.syncTools();
        this.resize();
      }
      if (this.displaySettings) {
        this.applyDisplay(viewer, this.displaySettings);
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
    resetColorLayers(this);
    this.models.clear();
    this.anchor = null;
    this.anchoring = null;
    this.anchorId = null;
    this.boxes.clear();
    this.placements.clear();
    this.documents.clear();
    this.loadedNodes.clear();
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
      for (const event of visibilityEvents(viewing)) {
        viewer.removeEventListener(event, this.onVisibility);
      }
      for (const event of this.measureEventIds) {
        viewer.removeEventListener(event, this.onMeasureChange);
      }
      this.measureEventIds = [];
      viewer.removeEventListener(
        viewing.TOOLBAR_CREATED_EVENT,
        this.onToolbarCreated,
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
      for (const event of visibilityEvents(viewing)) {
        viewer.removeEventListener(event, this.onVisibility);
      }
      for (const event of this.measureEventIds) {
        viewer.removeEventListener(event, this.onMeasureChange);
      }
      this.measureEventIds = [];
      viewer.removeEventListener(
        viewing.TOOLBAR_CREATED_EVENT,
        this.onToolbarCreated,
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
    colorLayersFor(this).clearAll();
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
    const { onRows: _rows, ...rest } = options;
    const items = await readInChunks(
      leafIds(tree),
      (chunk) =>
        new Promise<BulkPropertyItem[]>((resolve, reject) =>
          model.getBulkProperties(chunk, {}, resolve, reject),
        ),
      { ...rest, phase: 'discovery' },
    );
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
    const toRow = (item: BulkPropertyItem): PropertyRow => {
      const properties: PropertyRow['properties'] = {};
      for (const name of propertyNames) properties[name] = null;
      for (const prop of item.properties) {
        if (properties[prop.displayName] === null) {
          properties[prop.displayName] = toPropertyValue(prop.displayValue);
        }
      }
      return { dbId: item.dbId, name: item.name, properties };
    };
    const rows: PropertyRow[] = [];
    const { onRows, ...rest } = options;
    await readInChunks<BulkPropertyItem>(
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
      {
        ...rest,
        phase: 'rows',
        onRows: (chunk) => {
          const mapped = chunk.map(toRow);
          rows.push(...mapped);
          onRows?.(mapped);
        },
      },
    );
    return rows;
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

  onVisibilityChange(cb: () => void): () => void {
    return this.visibility.subscribe(() => cb());
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unload();
    this.controller?.dispose();
    this.controller = null;
    this.selection.clear();
    this.visibility.clear();
    this.measureListeners.clear();
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
