import type { PropertyRow } from '../../shared/types.js';
import type { IfcSourceRead } from '../ifc/types.js';
import type { ThemeScheme } from '../theme/theme.js';
import type { GeometryRead } from './geometryTypes.js';
import type {
  ModelDbId,
  ModelInfo,
  ModelMeta,
  ModelSource,
  ModelSpread,
  Vec3,
} from './modelSet.js';
import type { PlacementInfo } from './placement.js';
import type {
  ElementProperties,
  PropertyInfo,
  ReadOptions,
} from './propertyReads.js';

export type Rgba = readonly [r: number, g: number, b: number, a: number];

export interface PaintSwatchSpec {
  id: string;
  icon: string;
  label: string;
  swatch: string;
  color: Rgba;
}

export interface PaintToolSpec {
  id: string;
  tooltip: string;
  swatches: readonly PaintSwatchSpec[];
  reset: { id: string; label: string };
  selectHint: string;
  resetHint: string;
  onPaint: (color: Rgba) => boolean;
  onReset: () => void;
}

export interface ExportMenuItem {
  id: string;
  icon: string;
  tooltip: string;
  run: () => void;
}

export interface ExportToolSpec {
  id: string;
  icon: string;
  tooltip: string;
  onExport: () => void;
  menu?: ExportMenuItem[];
}

export interface ToolGroupSpec {
  id: string;
  title: string;
  paint?: PaintToolSpec;
  exports: ExportToolSpec[];
}

export type LoadStage = 'starting' | 'manifest' | 'geometry';

export interface CameraState {
  eye: Vec3;
  target: Vec3;
  up: Vec3;
  ortho: boolean;
  orthoHeight?: number;
}

export interface RestoreReport {
  skippedModels: string[];
  viewerFailed: boolean;
}

export const NOTHING_SKIPPED: RestoreReport = {
  skippedModels: [],
  viewerFailed: false,
};

export interface ViewerState {
  version: 1;
  camera: CameraState | null;
  cutplanes: number[][];
  explode?: number;
  models: Record<
    string,
    { isolated: number[]; hidden: number[]; selection: number[] }
  >;
}

export interface ElementSearchOptions {
  attributes?: readonly string[];
  signal?: AbortSignal;
}

export interface ElementSearchResult {
  items: ModelDbId[];
  failedModels: string[];
}

export type MeasureMode = 'distance' | 'angle' | 'area';

export interface MeasurementInfo {
  id: string;
  type: string;
  value: string;
}

export interface ViewNode {
  id: string;
  name: string;
  role: '2d' | '3d';
  current: boolean;
}

export interface DisplaySettings {
  lightPreset: number | null;
  groundShadow: boolean;
  groundReflection: boolean;
  edges: boolean;
  ambientOcclusion: boolean;
  antialiasing: boolean;
  performance: boolean;
}

export type { PlacementInfo } from './placement.js';

export interface ViewerAdapter {
  load(urn: string, name?: string, meta?: ModelMeta): Promise<void>;
  unload(): void;
  resize(): void;
  scheduleResize(settleMs: number): void;
  clearSelection(): void;
  clearThemingColors(): void;
  setTheme(theme: ThemeScheme): void;
  getLeafProperties(
    propertyNames: string[],
    modelIds?: readonly string[],
    options?: ReadOptions,
  ): Promise<PropertyRow[]>;
  discoverProperties(
    modelIds?: readonly string[],
    options?: ReadOptions,
  ): Promise<PropertyInfo[]>;
  registerToolGroup(spec: ToolGroupSpec): () => void;
  onSelectionChange(cb: (items: ModelDbId[]) => void): () => void;
  onVisibilityChange(cb: () => void): () => void;
  destroy(): void;
  loadModels(sources: readonly ModelSource[]): Promise<ModelInfo[]>;
  addModel(source: ModelSource): Promise<ModelInfo>;
  removeModel(modelId: string): void;
  getModels(): ModelInfo[];
  setModelVisible(modelId: string, visible: boolean): void;
  onLoadStage(cb: (stage: LoadStage) => void): () => void;
  onModelsChange(cb: (models: ModelInfo[]) => void): () => void;
  getModelSelection(): ModelDbId[];
  getModelWeight(modelId: string): number | null;
  getExternalIdMap(modelId: string): Promise<Record<string, number>>;
  setGhosting(enabled: boolean): void;
  getIsolated(): ModelDbId[];
  getVisible(): Promise<ModelDbId[]>;
  selectModelIds(items: readonly ModelDbId[]): void;
  isolateModelIds(items: readonly ModelDbId[]): void;
  hideModelIds(items: readonly ModelDbId[]): void;
  showModelIds(items: readonly ModelDbId[]): void;
  showAll(): void;
  fitToView(items?: readonly ModelDbId[]): void;
  getState(): ViewerState;
  restoreState(state: ViewerState): Promise<RestoreReport>;
  getScreenshot(width?: number, height?: number): Promise<Blob>;
  getCamera(): CameraState | null;
  setCamera(camera: CameraState): void;
  setModelThemingColor(items: readonly ModelDbId[], color: Rgba): void;
  clearModelThemingColors(items: readonly ModelDbId[]): void;
  getSpread(): ModelSpread | null;
  getTogetherOffsets(): Record<string, Vec3>;
  setModelOffsets(offsets: Readonly<Record<string, Vec3>> | null): void;
  getPlacementInfo(): PlacementInfo[];
  listMeasurements(): MeasurementInfo[];
  startMeasure(mode: MeasureMode): Promise<boolean>;
  clearMeasurements(): void;
  onMeasurementsChange(cb: () => void): () => void;
  setHiddenControls(ids: readonly string[]): string[];
  applyDisplaySettings(settings: DisplaySettings): string[];
  listViews(modelId: string): Promise<ViewNode[]>;
  getGeometryParts(): Promise<GeometryRead>;
  getIfcSource(): Promise<IfcSourceRead>;
  getElementsProperties(
    items: readonly ModelDbId[],
  ): Promise<(ElementProperties | null)[]>;
  searchElements(
    text: string,
    options?: ElementSearchOptions,
  ): Promise<ElementSearchResult>;
}

export type ViewerAdapterFactory = (
  container: HTMLElement,
) => Promise<ViewerAdapter>;
