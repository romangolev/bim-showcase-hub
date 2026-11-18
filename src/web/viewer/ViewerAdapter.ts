import type { PropertyRow } from '../../shared/types.js';
import type { IfcSourceRead } from '../ifc/types.js';
import type { Theme } from '../theme/theme.js';
import type { GeometryRead } from './geometryTypes.js';
import type {
  ModelDbId,
  ModelInfo,
  ModelMeta,
  ModelSource,
  ModelSpread,
  Vec3,
} from './modelSet.js';
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

export interface ExportToolSpec {
  id: string;
  icon: string;
  tooltip: string;
  onExport: () => void;
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
}

export interface ViewerAdapter {
  load(urn: string, name?: string, meta?: ModelMeta): Promise<void>;
  unload(): void;
  resize(): void;
  scheduleResize(settleMs: number): void;
  clearSelection(): void;
  clearThemingColors(): void;
  setTheme(theme: Theme): void;
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
  getIsolated(): ModelDbId[];
  getVisible(): Promise<ModelDbId[]>;
  selectModelIds(items: readonly ModelDbId[]): void;
  isolateModelIds(items: readonly ModelDbId[]): void;
  hideModelIds(items: readonly ModelDbId[]): void;
  showAll(): void;
  fitToSelection(): void;
  getScreenshot(): Promise<Blob>;
  getCamera(): CameraState | null;
  setCamera(camera: CameraState): void;
  setModelThemingColor(items: readonly ModelDbId[], color: Rgba): void;
  getSpread(): ModelSpread | null;
  getTogetherOffsets(): Record<string, Vec3>;
  setModelOffsets(offsets: Readonly<Record<string, Vec3>> | null): void;
  getGeometryParts(): Promise<GeometryRead>;
  getIfcSource(): Promise<IfcSourceRead>;
  getElementProperties(item: ModelDbId): Promise<ElementProperties | null>;
}

export type ViewerAdapterFactory = (
  container: HTMLElement,
) => Promise<ViewerAdapter>;
