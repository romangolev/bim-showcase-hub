import type { PropertyRow } from '../../shared/types.js';
import type { Theme } from '../theme/theme.js';
import type {
  ModelDbId,
  ModelInfo,
  ModelSource,
  ModelSpread,
  Vec3,
} from './modelSet.js';

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
  tooltip: string;
  onExport: () => void;
}

export interface ToolGroupSpec {
  id: string;
  title: string;
  paint: PaintToolSpec;
  export: ExportToolSpec;
}

export interface ViewerAdapter {
  load(urn: string, name?: string): Promise<void>;
  unload(): void;
  resize(): void;
  scheduleResize(settleMs: number): void;
  clearSelection?(): void;
  clearThemingColors(): void;
  setTheme(theme: Theme): void;
  getLeafProperties(
    propertyNames: string[],
    modelIds?: readonly string[],
  ): Promise<PropertyRow[]>;
  registerToolGroup(spec: ToolGroupSpec): () => void;
  onSelectionChange(cb: (items: ModelDbId[]) => void): () => void;
  destroy(): void;
  loadModels(sources: readonly ModelSource[]): Promise<ModelInfo[]>;
  addModel(source: ModelSource): Promise<ModelInfo>;
  removeModel(modelId: string): void;
  getModels(): ModelInfo[];
  setModelVisible(modelId: string, visible: boolean): void;
  onModelsChange(cb: (models: ModelInfo[]) => void): () => void;
  getModelSelection(): ModelDbId[];
  setModelThemingColor(items: readonly ModelDbId[], color: Rgba): void;
  getSpread(): ModelSpread | null;
  getTogetherOffsets(): Record<string, Vec3>;
  setModelOffsets(offsets: Readonly<Record<string, Vec3>> | null): void;
}

export type ViewerAdapterFactory = (
  container: HTMLElement,
) => Promise<ViewerAdapter>;
