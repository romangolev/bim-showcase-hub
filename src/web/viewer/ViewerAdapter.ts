import type { PropertyRow } from '../../shared/types.js';
import type { Theme } from '../theme/theme.js';

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
  load(urn: string): Promise<void>;
  unload(): void;
  resize(): void;
  scheduleResize(settleMs: number): void;
  getSelection(): number[];
  clearSelection?(): void;
  setThemingColor(ids: number[], color: Rgba): void;
  clearThemingColors(): void;
  setTheme(theme: Theme): void;
  getLeafProperties(propertyNames: string[]): Promise<PropertyRow[]>;
  registerToolGroup(spec: ToolGroupSpec): () => void;
  onSelectionChange(cb: (ids: number[]) => void): () => void;
  destroy(): void;
}

export type ViewerAdapterFactory = (
  container: HTMLElement,
) => Promise<ViewerAdapter>;
