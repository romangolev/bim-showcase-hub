import type { PropertyRow } from '../../shared/types.js';
import type { IfcSourceRead } from '../ifc/types.js';
import type { Theme } from '../theme/theme.js';
import {
  PAINT_ICON_CLASS,
  RESET_ICON_CLASS,
  swatchIconClass,
} from './autodeskTools.js';
import { colorLayersFor, resetColorLayers } from './colorLayers.js';
import { NO_GEOMETRY_MESSAGE, STILL_PROCESSING_MESSAGE } from './federation.js';
import type { GeometryPart, GeometryRead } from './geometryTypes.js';
import {
  buildMockElements,
  buildMockRows,
  elementProperties,
  LARGE_FIXTURE_ROWS,
  MOCK_PROPERTY_INFOS,
  type MockElement,
  type Point,
} from './mockModel.js';
import {
  checkCapacity,
  loadFailure,
  type ModelBox,
  type ModelDbId,
  type ModelInfo,
  type ModelMeta,
  ModelSet,
  ModelSetError,
  type ModelSource,
  type ModelSpread,
  modelIdFor,
  uniqueSources,
  type Vec3,
  VIEWER_CLOSED_MESSAGE,
} from './modelSet.js';
import { NATIVE_CONTROLS } from './nativeControls.js';
import { Placement, type PlacementInfo } from './placement.js';
import { PropertyReader } from './propertyReader.js';
import {
  type ElementProperties,
  type PropertyInfo,
  type ReadOptions,
  throwIfAborted,
} from './propertyReads.js';
import {
  claimRegion,
  detectRegion,
  RegionConflictError,
  regionAvailable,
} from './region.js';
import { createResizeScheduler } from './resizeScheduler.js';
import { SelectionHub } from './selectionHub.js';
import {
  ToolGroupController,
  type ToolGroupState,
} from './toolGroupController.js';
import type {
  CameraState,
  DisplaySettings,
  LoadStage,
  MeasureMode,
  MeasurementInfo,
  PaintSwatchSpec,
  RestoreReport,
  Rgba,
  ToolGroupSpec,
  ViewerAdapter,
  ViewerState,
  ViewNode,
} from './ViewerAdapter.js';
import { NOTHING_SKIPPED } from './ViewerAdapter.js';
import { sanitizeViewerState } from './viewerState.js';
import './viewer.css';

const SVG_NS = 'http://www.w3.org/2000/svg';

const FAKE_TOOLS: {
  id: string;
  label: string;
  icon: string;
  native?: string;
}[] = [
  {
    id: 'home',
    label: 'Home',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  },
  {
    id: 'orbit',
    label: 'Orbit',
    native: 'toolbar-orbitTools',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18"><ellipse cx="12" cy="12" rx="9" ry="4" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>',
  },
  {
    id: 'measure',
    label: 'Measure',
    native: 'toolbar-measurementSubmenuTool',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 15l12-12 6 6-12 12z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  },
];

const MOCK_MEASURES: Record<MeasureMode, string> = {
  distance: '3.50 m',
  angle: '90°',
  area: '12.25 m²',
};

export const MOCK_VIEWS: ViewNode[] = [
  { id: 'mock-3d', name: '{3D}', role: '3d', current: true },
  { id: 'mock-a101', name: 'A101 - Plans', role: '2d', current: false },
];

function pointsAttr(points: Point[]): string {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}

interface MockToolGroup {
  element: HTMLElement;
  dispose: () => void;
}

function iconSpan(iconClass: string): string {
  return `<span class="bsh-mock__icon ${iconClass}" aria-hidden="true"></span>`;
}

function setDisabled(
  button: HTMLButtonElement,
  disabled: boolean,
  tooltip: string,
): void {
  button.title = tooltip;
  if (disabled) button.setAttribute('aria-disabled', 'true');
  else button.removeAttribute('aria-disabled');
}

export const MOCK_BROKEN_MARKER = 'broken';
export const MOCK_LOAD_ERROR = 'Mock model failed to load';
export const MOCK_NO_PROPERTIES_MARKER = 'noprops';
export const MOCK_NO_GEOMETRY_MARKER = 'nogeom';
export const MOCK_PROCESSING_MARKER = 'processing';
export const MOCK_NO_ACCESS_MARKER = 'noaccess';
export const MOCK_NO_ACCESS_ERROR = 'Document load failed (4): mock';
const MODEL_GAP = 48;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MockScene {
  group: SVGGElement;
  nodes: Map<number, SVGPolygonElement>;
  box: Box;
  shift: number;
  offset: Vec3;
}

export const MOCK_FAR_MARKER = 'far';
export const MOCK_FAR_DISTANCE = 1_000_000;

function placedBox(scene: MockScene): Box {
  return {
    ...scene.box,
    x: scene.box.x + scene.offset[0],
    y: scene.box.y + scene.offset[1],
  };
}

function modelBoxOf(id: string, box: Box): ModelBox {
  return {
    id,
    min: [box.x, box.y, 0],
    max: [box.x + box.width, box.y + box.height, 0],
  };
}

const MOCK_GLB_COLORS = [
  [0.52, 0.65, 0.78, 1],
  [0.78, 0.62, 0.48, 1],
  [0.56, 0.72, 0.56, 1],
  [0.72, 0.56, 0.72, 1],
] as const;

function mockGeometryPart(
  info: ModelInfo,
  scene: MockScene,
  index: number,
): GeometryPart {
  const { x, y, width, height } = scene.box;
  const depth = Math.max(width, height) * 0.6;
  const half = depth / 2;
  const positions = new Float32Array([
    x,
    y,
    -half,
    x + width,
    y,
    -half,
    x + width,
    y + height,
    -half,
    x,
    y + height,
    -half,
    x,
    y,
    half,
    x + width,
    y,
    half,
    x + width,
    y + height,
    half,
    x,
    y + height,
    half,
  ]);
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 2, 6, 3, 6, 7, 0,
    3, 7, 0, 7, 4, 1, 2, 6, 1, 6, 5,
  ]);
  return {
    name: info.name || info.id,
    model: info.name || info.id,
    positions,
    indices,
    dbId: index + 1,
    color: MOCK_GLB_COLORS[index % MOCK_GLB_COLORS.length],
  };
}

function selectionKey(modelId: string, dbId: number): string {
  return `${dbId}\u0000${modelId}`;
}

function parseKey(key: string): ModelDbId {
  const split = key.indexOf('\u0000');
  return { dbId: Number(key.slice(0, split)), modelId: key.slice(split + 1) };
}

function boxOf(elements: readonly MockElement[]): Box {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const element of elements) {
    for (const [x, y] of element.points) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function statusText(ready: number): string {
  if (ready > 1) return `Mock viewer, ${ready} models`;
  if (ready === 1) return 'Mock viewer, fixture model';
  return 'Mock viewer';
}

export function mockRowVariant(urn: string): number {
  let hash = 0;
  for (const char of urn) hash = (hash * 31 + char.charCodeAt(0)) % 9973;
  return hash % 997;
}

function rgbaCss([r, g, b, a]: Rgba): string {
  const to = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return `rgba(${to(r)}, ${to(g)}, ${to(b)}, ${a})`;
}

export class MockViewerAdapter implements ViewerAdapter {
  private root: HTMLDivElement | null = null;
  private svg: SVGSVGElement | null = null;
  private toolbar: HTMLDivElement | null = null;
  private status: HTMLDivElement | null = null;
  private selection = new Set<string>();
  private isolated: Set<string> | null = null;
  private ghosting = true;
  private hiddenKeys = new Set<string>();
  private readonly models = new ModelSet<MockScene>();
  private readonly placement = new Placement<MockScene>(this.models, {
    boxOf: (info, handle) => modelBoxOf(info.id, handle.box),
    anchorId: () => this.models.ready()[0]?.info.id,
    unitMeters: () => 1,
    apply: (_info, handle, offset) => this.applyOffset(handle, offset),
  });
  private readonly reader = new PropertyReader<MockScene>(this.models, {
    rows: async ({ info }, propertyNames, options) => {
      if (info.urn.includes(MOCK_NO_PROPERTIES_MARKER)) {
        throw new Error('mock');
      }
      const bulk = import.meta.env.MODE === 'test' ? 0 : LARGE_FIXTURE_ROWS;
      const extra = bulk ? bulk + mockRowVariant(info.urn) : 0;
      const rows = buildMockRows(propertyNames, extra);
      options.onProgress?.({
        phase: 'rows',
        loaded: rows.length,
        total: rows.length,
        partial: false,
      });
      return rows;
    },
    infos: async ({ info }) => {
      if (info.urn.includes(MOCK_NO_PROPERTIES_MARKER)) {
        throw new Error('mock');
      }
      return [...MOCK_PROPERTY_INFOS];
    },
  });
  private readonly themed = new Map<string, Rgba>();
  private readonly hub = new SelectionHub();
  private readonly visibility = new SelectionHub();
  private placed = 0;
  private bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null = null;
  private controller: ToolGroupController | null = null;
  private disposeGroup: (() => void) | null = null;
  private theme: Theme = 'dark';
  private camera: CameraState | null = {
    eye: [0, 0, 10],
    target: [0, 0, 0],
    up: [0, 1, 0],
    ortho: false,
  };
  private loaded = false;
  private destroyed = false;
  private explodeScale = 0;
  private measurements: MeasurementInfo[] = [];
  private readonly measureListeners = new Set<() => void>();
  private view = 'mock-3d';
  private hiddenControls = new Set<string>();
  private displaySettings: DisplaySettings | null = null;
  private readonly resizer = createResizeScheduler(() => this.resize());

  constructor(private readonly container: HTMLElement) {
    this.build();
  }

  private readonly stageListeners = new Set<(stage: LoadStage) => void>();

  onLoadStage(cb: (stage: LoadStage) => void): () => void {
    this.stageListeners.add(cb);
    return () => {
      this.stageListeners.delete(cb);
    };
  }

  async load(urn: string, name?: string, meta?: ModelMeta): Promise<void> {
    await this.loadModels([{ urn, ...(name ? { name } : {}), ...meta }]);
  }

  async loadModels(sources: readonly ModelSource[]): Promise<ModelInfo[]> {
    if (this.destroyed) return [];
    const unique = uniqueSources(sources);
    checkCapacity(0, unique.length);
    const region = detectRegion(unique[0]?.urn ?? '');
    if (!regionAvailable(region)) throw new RegionConflictError(region);
    this.unload();
    for (const stage of ['starting', 'manifest', 'geometry'] as const) {
      for (const cb of [...this.stageListeners]) cb(stage);
    }
    for (const source of unique) this.models.add(source);
    for (const source of unique) this.loadOne(source);
    const models = this.models.list();
    if (models.some((model) => model.status === 'ready')) claimRegion(region);
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
    this.loadOne(source);
    return this.models.get(info.id) ?? info;
  }

  removeModel(modelId: string): void {
    const removed = this.models.remove(modelId);
    if (!removed) return;
    removed.handle?.group.remove();
    this.forgetModel(modelId);
    colorLayersFor(this).forgetModel(modelId);
    this.refresh();
  }

  getSpread(): ModelSpread | null {
    return this.placement.spread();
  }

  getTogetherOffsets(): Record<string, Vec3> {
    return this.placement.togetherOffsets();
  }

  setModelOffsets(offsets: Readonly<Record<string, Vec3>> | null): void {
    this.placement.set(offsets);
    this.refresh();
  }

  getPlacementInfo(): PlacementInfo[] {
    return this.placement.info(
      () => 'm',
      () => null,
    );
  }

  listMeasurements(): MeasurementInfo[] {
    return this.measurements.map((entry) => ({ ...entry }));
  }

  async startMeasure(mode: MeasureMode): Promise<boolean> {
    if (this.destroyed) return false;
    this.measurements.push({
      id: String(this.measurements.length + 1),
      type: mode,
      value: MOCK_MEASURES[mode],
    });
    this.emitMeasurements();
    return true;
  }

  clearMeasurements(): void {
    this.measurements = [];
    this.emitMeasurements();
  }

  onMeasurementsChange(cb: () => void): () => void {
    this.measureListeners.add(cb);
    return () => {
      this.measureListeners.delete(cb);
    };
  }

  private emitMeasurements(): void {
    for (const cb of [...this.measureListeners]) cb();
  }

  setHiddenControls(ids: readonly string[]): string[] {
    this.hiddenControls = new Set(ids);
    this.applyHiddenControls();
    const known = new Set<string>(NATIVE_CONTROLS.map((control) => control.id));
    return ids.filter((id) => !known.has(id));
  }

  private applyHiddenControls(): void {
    const toolbar = this.toolbar;
    if (!toolbar) return;
    for (const button of toolbar.querySelectorAll<HTMLElement>(
      '[data-native-id]',
    )) {
      const id = button.dataset.nativeId ?? '';
      const hidden = this.hiddenControls.has(id);
      button.hidden = hidden;
      button.style.display = hidden ? 'none' : '';
    }
  }

  applyDisplaySettings(settings: DisplaySettings): string[] {
    this.displaySettings = { ...settings };
    if (this.root) this.root.dataset.display = JSON.stringify(settings);
    return [];
  }

  async listViews(modelId: string): Promise<ViewNode[]> {
    if (!this.models.get(modelId)) return [];
    const current = this.models.get(modelId)?.view ?? 'mock-3d';
    return MOCK_VIEWS.map((view) => ({
      ...view,
      current: view.id === current,
    }));
  }

  private applyOffset(scene: MockScene, offset: Vec3 | undefined): void {
    scene.offset = offset ?? [0, 0, 0];
    const x = scene.shift + scene.offset[0];
    const y = scene.offset[1];
    if (x || y) scene.group.setAttribute('transform', `translate(${x} ${y})`);
    else scene.group.removeAttribute('transform');
    scene.group.dataset.offset = offset ? 'moved' : 'original';
  }

  getModels(): ModelInfo[] {
    return this.models.list();
  }

  async getGeometryParts(): Promise<GeometryRead> {
    const ready = this.models.shown();
    if (ready.length === 0) throw new Error('No geometry to export');
    return {
      parts: ready.map(({ info, handle }, index) =>
        mockGeometryPart(info, handle, index),
      ),
      skipped: 0,
    };
  }

  async getIfcSource(): Promise<IfcSourceRead> {
    const ready = this.models.shown();
    if (ready.length === 0) throw new Error('No geometry to export');
    return {
      skipped: 0,
      models: ready.map(({ info, handle }, index) => {
        const name = info.name || info.id;
        const part = mockGeometryPart(info, handle, index);
        return {
          id: info.id,
          name,
          urn: info.urn,
          elements: [
            {
              dbId: index + 1,
              name: `${name} wall`,
              properties: {
                'Identity Data': {
                  Category: 'Revit Walls',
                  'Type Name': 'Basic Wall',
                },
                Constraints: { Level: 'Level 1' },
              },
              parts: [part],
            },
          ],
        };
      }),
    };
  }

  async getElementsProperties(
    items: readonly ModelDbId[],
  ): Promise<(ElementProperties | null)[]> {
    return items.map(({ modelId, dbId }) => {
      if (!this.nodeOf(modelId, dbId)) return null;
      const element = buildMockElements().find((entry) => entry.dbId === dbId);
      if (!element) return null;
      const values = elementProperties(element);
      return {
        dbId,
        name: element.name,
        properties: MOCK_PROPERTY_INFOS.map(({ category, name }) => ({
          category,
          name,
          value: values[name] ?? null,
        })),
      };
    });
  }

  setModelVisible(modelId: string, visible: boolean): void {
    if (!this.models.setVisible(modelId, visible)) return;
    const scene = this.models.handle(modelId);
    if (!scene) return;
    if (visible) {
      scene.group.removeAttribute('display');
    } else {
      scene.group.setAttribute('display', 'none');
      this.dropSelectionOf(modelId);
    }
    this.refresh();
  }

  onModelsChange(cb: (models: ModelInfo[]) => void): () => void {
    return this.models.onChange(cb);
  }

  getModelSelection(): ModelDbId[] {
    return [...this.selection].map(parseKey);
  }

  selectModelIds(items: readonly ModelDbId[]): void {
    this.setSelectionKeys(
      items
        .filter((item) => this.nodeOf(item.modelId, item.dbId))
        .map((item) => selectionKey(item.modelId, item.dbId)),
    );
  }

  getModelWeight(modelId: string): number | null {
    return this.models.handle(modelId)?.nodes.size ?? null;
  }

  async getExternalIdMap(modelId: string): Promise<Record<string, number>> {
    const scene = this.models.handle(modelId);
    if (!scene) return {};
    const map: Record<string, number> = {};
    for (const dbId of scene.nodes.keys()) map[`mock-${dbId}`] = dbId;
    return map;
  }

  async getScreenshot(
    targetWidth?: number,
    targetHeight?: number,
  ): Promise<Blob> {
    const svg = this.svg;
    if (!svg) throw new Error('The viewer cannot take a snapshot');
    const { width, height } = svg.getBoundingClientRect();
    const copy = svg.cloneNode(true) as SVGSVGElement;
    copy.setAttribute('xmlns', SVG_NS);
    copy.setAttribute('width', String(Math.max(1, Math.round(width))));
    copy.setAttribute('height', String(Math.max(1, Math.round(height))));
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error('The snapshot could not be drawn'));
    });
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      new XMLSerializer().serializeToString(copy),
    )}`;
    await loaded;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(targetWidth ?? width));
    canvas.height = Math.max(1, Math.round(targetHeight ?? height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The snapshot could not be drawn');
    context.fillStyle = '#0b0b0c';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error('The snapshot failed')),
        'image/png',
      ),
    );
  }

  getCamera(): CameraState | null {
    return this.camera;
  }

  setCamera(camera: CameraState): void {
    this.camera = camera;
    if (this.root) this.root.dataset.camera = JSON.stringify(camera);
  }

  fitToView(items?: readonly ModelDbId[]): void {
    if (this.root) this.root.dataset.fit = JSON.stringify(items ?? null);
  }

  getState(): ViewerState {
    const state: ViewerState = {
      version: 1,
      camera: this.camera ? { ...this.camera } : null,
      cutplanes: [],
      models: {},
    };
    if (this.explodeScale > 0) state.explode = this.explodeScale;
    for (const { info } of this.models.shown()) {
      state.models[info.id] = { isolated: [], hidden: [], selection: [] };
    }
    const add = (
      keys: Iterable<string>,
      field: 'isolated' | 'hidden' | 'selection',
    ) => {
      for (const key of keys) {
        const { modelId, dbId } = parseKey(key);
        state.models[modelId]?.[field].push(dbId);
      }
    };
    add(this.isolated ?? [], 'isolated');
    add(this.hiddenKeys, 'hidden');
    add(this.selection, 'selection');
    return state;
  }

  async restoreState(raw: ViewerState): Promise<RestoreReport> {
    const state = sanitizeViewerState(raw);
    if (!state) return NOTHING_SKIPPED;
    const keys = (field: 'isolated' | 'hidden' | 'selection') =>
      Object.entries(state.models)
        .filter(([modelId]) => this.models.get(modelId)?.visible)
        .flatMap(([modelId, entry]) =>
          entry[field]
            .filter((dbId) => this.nodeOf(modelId, dbId))
            .map((dbId) => selectionKey(modelId, dbId)),
        );
    const isolated = keys('isolated');
    this.isolated = isolated.length > 0 ? new Set(isolated) : null;
    this.hiddenKeys = new Set(keys('hidden'));
    this.applyIsolation();
    this.setSelectionKeys(keys('selection'));
    if (state.camera) this.setCamera(state.camera);
    this.explodeScale = state.explode ?? 0;
    return NOTHING_SKIPPED;
  }

  getIsolated(): ModelDbId[] {
    return this.isolated ? [...this.isolated].map(parseKey) : [];
  }

  async getVisible(): Promise<ModelDbId[]> {
    const isolated = this.isolated;
    return this.models
      .shown()
      .flatMap(({ info, handle }) =>
        [...handle.nodes.keys()]
          .filter(
            (dbId) =>
              (!isolated || isolated.has(selectionKey(info.id, dbId))) &&
              !this.hiddenKeys.has(selectionKey(info.id, dbId)),
          )
          .map((dbId) => ({ modelId: info.id, dbId })),
      );
  }

  isolateModelIds(items: readonly ModelDbId[]): void {
    const keys = items
      .filter((item) => this.nodeOf(item.modelId, item.dbId))
      .map((item) => selectionKey(item.modelId, item.dbId));
    this.isolated = keys.length > 0 ? new Set(keys) : null;
    this.applyIsolation();
  }

  hideModelIds(items: readonly ModelDbId[]): void {
    for (const item of items) {
      if (this.nodeOf(item.modelId, item.dbId)) {
        this.hiddenKeys.add(selectionKey(item.modelId, item.dbId));
      }
    }
    this.applyIsolation();
  }

  showAll(): void {
    this.hiddenKeys.clear();
    this.isolated = null;
    this.applyIsolation();
  }

  private applyIsolation(): void {
    for (const { info, handle } of this.models.ready()) {
      for (const [dbId, node] of handle.nodes) {
        const key = selectionKey(info.id, dbId);
        const outside = this.isolated !== null && !this.isolated.has(key);
        node.classList.toggle('bsh-mock__el--dim', this.ghosting && outside);
        node.classList.toggle(
          'bsh-mock__el--hidden',
          this.hiddenKeys.has(key) || (!this.ghosting && outside),
        );
      }
    }
    this.visibility.emit([]);
  }

  setGhosting(enabled: boolean): void {
    if (this.ghosting === enabled) return;
    this.ghosting = enabled;
    this.applyIsolation();
  }

  setModelThemingColor(items: readonly ModelDbId[], color: Rgba): void {
    for (const { modelId, dbId } of items) {
      const node = this.nodeOf(modelId, dbId);
      if (!node) continue;
      this.themed.set(selectionKey(modelId, dbId), color);
      node.style.fill = rgbaCss(color);
      node.classList.add('bsh-mock__el--themed');
    }
  }

  clearModelThemingColors(items: readonly ModelDbId[]): void {
    for (const { modelId, dbId } of items) {
      if (!this.themed.delete(selectionKey(modelId, dbId))) continue;
      const node = this.nodeOf(modelId, dbId);
      node?.style.removeProperty('fill');
      node?.classList.remove('bsh-mock__el--themed');
    }
  }

  unload(): void {
    for (const scene of this.models.clear()) scene.group.remove();
    this.svg?.replaceChildren();
    resetColorLayers(this);
    this.themed.clear();
    this.isolated = null;
    this.hiddenKeys.clear();
    this.bounds = null;
    this.loaded = false;
    this.placed = 0;
    this.view = 'mock-3d';
    this.measurements = [];
    this.placement.reset();
    this.setSelectionKeys([]);
    this.controller?.clearPainted();
    if (this.root) delete this.root.dataset.view;
    this.refresh();
  }

  resize(): void {
    this.fit();
  }

  scheduleResize(settleMs: number): void {
    this.resizer.schedule(settleMs);
  }

  clearSelection(): void {
    this.setSelectionKeys([]);
  }

  selectIds(ids: number[]): void {
    const primary = this.models.primaryId();
    if (!primary) return;
    this.selectModelIds(ids.map((dbId) => ({ modelId: primary, dbId })));
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    if (this.root) this.root.dataset.viewerTheme = theme;
  }

  clearThemingColors(): void {
    colorLayersFor(this).clearAll();
    for (const key of this.themed.keys()) {
      const { modelId, dbId } = parseKey(key);
      const node = this.nodeOf(modelId, dbId);
      node?.style.removeProperty('fill');
      node?.classList.remove('bsh-mock__el--themed');
    }
    this.themed.clear();
  }

  async getLeafProperties(
    propertyNames: string[],
    modelIds?: readonly string[],
    options: ReadOptions = {},
  ): Promise<PropertyRow[]> {
    if (!this.loaded) return [];
    throwIfAborted(options.signal);
    return this.reader.rows(propertyNames, modelIds, options);
  }

  async discoverProperties(
    modelIds?: readonly string[],
    options: ReadOptions = {},
  ): Promise<PropertyInfo[]> {
    if (!this.loaded) return [];
    throwIfAborted(options.signal);
    return this.reader.infos(modelIds, options);
  }

  registerToolGroup(spec: ToolGroupSpec): () => void {
    const toolbar = this.toolbar;
    if (!toolbar || this.destroyed) return () => {};
    this.disposeGroup?.();
    this.controller?.dispose();
    const controller = new ToolGroupController(spec, this);
    const group = this.buildToolGroup(controller);
    toolbar.appendChild(group.element);
    this.controller = controller;
    this.disposeGroup = group.dispose;
    return () => {
      if (this.controller !== controller) return;
      group.dispose();
      controller.dispose();
      this.controller = null;
      this.disposeGroup = null;
    };
  }

  onSelectionChange(cb: (items: ModelDbId[]) => void): () => void {
    return this.hub.subscribe(cb);
  }

  onVisibilityChange(cb: () => void): () => void {
    return this.visibility.subscribe(() => cb());
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.hub.clear();
    this.visibility.clear();
    this.measureListeners.clear();
    this.measurements = [];
    this.models.clear();
    this.models.dispose();
    this.themed.clear();
    this.disposeGroup?.();
    this.disposeGroup = null;
    this.controller?.dispose();
    this.controller = null;
    this.resizer.cancel();
    this.selection.clear();
    this.root?.remove();
    this.root = null;
    this.svg = null;
    this.toolbar = null;
    this.status = null;
  }

  private build(): void {
    const root = document.createElement('div');
    root.className = 'bsh-mock';
    root.dataset.testid = 'mock-viewer';
    root.dataset.viewerTheme = this.theme;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'bsh-mock__scene');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Mock building model');
    svg.addEventListener('click', this.onSceneClick);

    const status = document.createElement('div');
    status.className = 'bsh-mock__status';
    status.textContent = 'Mock viewer';

    const toolbar = document.createElement('div');
    toolbar.className = 'bsh-mock__toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Viewer toolbar');
    for (const tool of FAKE_TOOLS) {
      const button = this.createToolbarButton(
        tool.id,
        tool.label,
        tool.icon,
        tool.native,
      );
      button.addEventListener('click', () => {
        if (tool.id === 'home') this.setSelectionKeys([]);
        if (tool.id === 'measure') void this.startMeasure('distance');
      });
      toolbar.appendChild(button);
    }
    root.append(svg, status, toolbar);
    this.container.appendChild(root);
    this.root = root;
    this.svg = svg;
    this.status = status;
    this.toolbar = toolbar;
  }

  private createToolbarButton(
    id: string,
    tooltip: string,
    icon: string,
    native?: string,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bsh-mock__button';
    button.dataset.buttonId = id;
    if (native) button.dataset.nativeId = native;
    button.title = tooltip;
    button.setAttribute('aria-label', tooltip);
    button.innerHTML = icon;
    return button;
  }

  private buildToolGroup(controller: ToolGroupController): MockToolGroup {
    const { spec } = controller;
    const group = document.createElement('div');
    group.className = 'bsh-mock__group';
    group.dataset.groupId = spec.id;
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', spec.title);

    const separator = document.createElement('span');
    separator.className = 'bsh-mock__separator';

    const swatches: { swatch: PaintSwatchSpec; button: HTMLButtonElement }[] =
      [];
    let reset: HTMLButtonElement | null = null;
    let closePaint = () => {};
    const parts: HTMLElement[] = [];

    const paintSpec = spec.paint;
    if (paintSpec) {
      const comboEl = document.createElement('div');
      comboEl.className = 'bsh-mock__combo';
      const trigger = this.createToolbarButton(
        paintSpec.id,
        paintSpec.tooltip,
        iconSpan(PAINT_ICON_CLASS),
      );
      trigger.setAttribute('aria-haspopup', 'true');
      trigger.setAttribute('aria-expanded', 'false');
      const flyout = document.createElement('div');
      flyout.className = 'bsh-mock__flyout';
      flyout.hidden = true;
      flyout.setAttribute('role', 'group');
      flyout.setAttribute('aria-label', paintSpec.tooltip);

      for (const swatch of paintSpec.swatches) {
        const button = this.createToolbarButton(
          swatch.id,
          swatch.label,
          iconSpan(swatchIconClass(swatch.icon)),
        );
        button.addEventListener('click', () => {
          if (!controller.state.hasSelection) return;
          controller.paint(swatch.color);
          setOpen(false);
        });
        const swatchIcon = button.querySelector<HTMLElement>('.bsh-mock__icon');
        if (swatchIcon) swatchIcon.style.backgroundColor = swatch.swatch;
        flyout.appendChild(button);
        swatches.push({ swatch, button });
      }
      const resetButton = this.createToolbarButton(
        paintSpec.reset.id,
        paintSpec.reset.label,
        iconSpan(RESET_ICON_CLASS),
      );
      resetButton.addEventListener('click', () => {
        if (!controller.state.painted) return;
        controller.reset();
        setOpen(false);
      });
      flyout.appendChild(resetButton);
      reset = resetButton;
      comboEl.append(trigger, flyout);

      const onOutside = (event: Event) => {
        if (!comboEl.contains(event.target as Node)) setOpen(false);
      };
      const onKey = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        setOpen(false);
        trigger.focus();
      };
      const setOpen = (open: boolean) => {
        flyout.hidden = !open;
        trigger.setAttribute('aria-expanded', String(open));
        if (open) {
          document.addEventListener('pointerdown', onOutside);
          document.addEventListener('keydown', onKey);
        } else {
          document.removeEventListener('pointerdown', onOutside);
          document.removeEventListener('keydown', onKey);
        }
      };
      closePaint = () => setOpen(false);
      trigger.addEventListener('click', () => setOpen(Boolean(flyout.hidden)));
      parts.push(comboEl);
    }

    for (const entry of spec.exports) {
      const button = this.createToolbarButton(
        entry.id,
        entry.tooltip,
        iconSpan(entry.icon),
      );
      button.addEventListener('click', () => controller.export(entry.id));
      parts.push(button);
    }

    const apply = (state: ToolGroupState) => {
      if (!paintSpec) return;
      for (const { swatch, button } of swatches) {
        setDisabled(
          button,
          !state.hasSelection,
          state.hasSelection ? swatch.label : paintSpec.selectHint,
        );
      }
      if (reset) {
        setDisabled(
          reset,
          !state.painted,
          state.painted ? paintSpec.reset.label : paintSpec.resetHint,
        );
      }
    };
    apply(controller.state);
    const stop = controller.subscribe(apply);
    group.append(separator, ...parts);
    return {
      element: group,
      dispose: () => {
        stop();
        closePaint();
        group.remove();
      },
    };
  }

  private fit(): void {
    const svg = this.svg;
    const bounds = this.bounds;
    if (!svg || !bounds) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;
    const aspect = width / height;
    let viewWidth = bounds.width;
    let viewHeight = bounds.height;
    if (viewWidth / viewHeight < aspect) viewWidth = viewHeight * aspect;
    else viewHeight = viewWidth / aspect;
    const x = bounds.x + (bounds.width - viewWidth) / 2;
    const y = bounds.y + (bounds.height - viewHeight) / 2;
    svg.setAttribute('viewBox', `${x} ${y} ${viewWidth} ${viewHeight}`);
    svg.dataset.fitWidth = String(width);
    svg.dataset.fitHeight = String(height);
  }

  private loadOne(source: ModelSource): void {
    const id = modelIdFor(source.urn);
    if (source.urn.includes(MOCK_BROKEN_MARKER)) {
      this.models.fail(id, MOCK_LOAD_ERROR);
      return;
    }
    if (source.urn.includes(MOCK_NO_GEOMETRY_MARKER)) {
      this.models.fail(id, NO_GEOMETRY_MESSAGE, undefined, 'no-viewable');
      return;
    }
    if (source.urn.includes(MOCK_PROCESSING_MARKER)) {
      this.models.fail(id, STILL_PROCESSING_MESSAGE, undefined, 'processing');
      return;
    }
    if (source.urn.includes(MOCK_NO_ACCESS_MARKER)) {
      this.models.fail(id, MOCK_NO_ACCESS_ERROR, undefined, 'access');
      return;
    }
    const scene = this.renderModel(id, buildMockElements());
    if (!scene) {
      this.models.fail(id, MOCK_LOAD_ERROR);
      return;
    }
    if (!this.models.resolve(id, scene)) {
      scene.group.remove();
      return;
    }
    const offset = this.placement.offsetOf(id);
    if (offset) this.applyOffset(scene, offset);
    if (!this.models.get(id)?.visible) {
      scene.group.setAttribute('display', 'none');
    }
    this.view = source.view ?? 'mock-3d';
    if (this.root) this.root.dataset.view = this.view;
    this.applyHiddenControls();
    if (this.displaySettings && this.root) {
      this.root.dataset.display = JSON.stringify(this.displaySettings);
    }
    this.refresh();
  }

  private renderModel(
    modelId: string,
    elements: MockElement[],
  ): MockScene | null {
    const svg = this.svg;
    if (!svg) return null;
    const box = boxOf(elements);
    const shift =
      this.placed * (box.width + MODEL_GAP) +
      (modelId.includes(MOCK_FAR_MARKER) ? MOCK_FAR_DISTANCE : 0);
    this.placed += 1;
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'bsh-mock__model');
    group.dataset.modelId = modelId;
    if (shift) group.setAttribute('transform', `translate(${shift} 0)`);
    const nodes = new Map<number, SVGPolygonElement>();
    for (const element of elements) {
      const polygon = document.createElementNS(SVG_NS, 'polygon');
      polygon.setAttribute('points', pointsAttr(element.points));
      polygon.setAttribute(
        'class',
        `bsh-mock__el bsh-mock__el--${element.category.toLowerCase()}`,
      );
      polygon.dataset.dbid = String(element.dbId);
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = `${element.category}: ${element.name} (${element.level})`;
      polygon.appendChild(title);
      group.appendChild(polygon);
      nodes.set(element.dbId, polygon);
    }
    svg.appendChild(group);
    return {
      group,
      nodes,
      box: { ...box, x: box.x + shift },
      shift,
      offset: [0, 0, 0],
    };
  }

  private refresh(): void {
    const ready = this.models.ready();
    this.loaded = ready.length > 0;
    if (this.status) this.status.textContent = statusText(ready.length);
    const visible = ready.filter(({ info }) => info.visible);
    const svg = this.svg;
    if (!svg || visible.length === 0) {
      this.bounds = null;
      return;
    }
    const spread = this.getSpread();
    const anchor = ready[0];
    const framed =
      spread?.farApart && !this.placement.together && anchor?.info.visible
        ? [anchor]
        : visible;
    const boxes = framed.map(({ handle }) => placedBox(handle));
    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.width));
    const maxY = Math.max(...boxes.map((b) => b.y + b.height));
    const pad = 24;
    this.bounds = {
      x: minX - pad,
      y: minY - pad,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
    };
    svg.setAttribute(
      'viewBox',
      `${this.bounds.x} ${this.bounds.y} ${this.bounds.width} ${this.bounds.height}`,
    );
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.fit();
  }

  private nodeOf(modelId: string, dbId: number): SVGPolygonElement | undefined {
    return this.models.handle(modelId)?.nodes.get(dbId);
  }

  private dropSelectionOf(modelId: string): void {
    this.setSelectionKeys(
      [...this.selection].filter((key) => parseKey(key).modelId !== modelId),
    );
  }

  private forgetModel(modelId: string): void {
    for (const key of [...this.themed.keys()]) {
      if (parseKey(key).modelId === modelId) this.themed.delete(key);
    }
    this.dropSelectionOf(modelId);
  }

  private readonly onSceneClick = (event: MouseEvent): void => {
    const target = (event.target as Element | null)?.closest<SVGElement>(
      '[data-dbid]',
    );
    const modelId =
      target?.closest<SVGElement>('[data-model-id]')?.dataset.modelId;
    if (!target || modelId === undefined) {
      this.setSelectionKeys([]);
      return;
    }
    const key = selectionKey(modelId, Number(target.dataset.dbid));
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      const next = new Set(this.selection);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      this.setSelectionKeys([...next]);
      return;
    }
    this.setSelectionKeys([key]);
  };

  private setSelectionKeys(keys: string[]): void {
    const next = new Set(keys);
    const unchanged =
      next.size === this.selection.size &&
      [...next].every((key) => this.selection.has(key));
    if (unchanged) return;
    for (const key of this.selection) {
      const { modelId, dbId } = parseKey(key);
      this.nodeOf(modelId, dbId)?.classList.remove('bsh-mock__el--selected');
    }
    this.selection = next;
    for (const key of next) {
      const { modelId, dbId } = parseKey(key);
      this.nodeOf(modelId, dbId)?.classList.add('bsh-mock__el--selected');
    }
    this.hub.emit(this.getModelSelection());
  }
}

export async function createMockViewerAdapter(
  container: HTMLElement,
): Promise<ViewerAdapter> {
  return new MockViewerAdapter(container);
}
