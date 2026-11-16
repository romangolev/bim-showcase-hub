import type { PropertyRow } from '../../shared/types.js';
import type { Theme } from '../theme/theme.js';

export type Rgba = readonly [r: number, g: number, b: number, a: number];

export interface ToolbarButtonSpec {
  id: string;
  tooltip: string;
  icon: string;
  onClick: () => void;
}

export interface ViewerAdapter {
  load(urn: string): Promise<void>;
  unload(): void;
  getSelection(): number[];
  clearSelection?(): void;
  setThemingColor(ids: number[], color: Rgba): void;
  clearThemingColors(): void;
  setTheme(theme: Theme): void;
  getLeafProperties(propertyNames: string[]): Promise<PropertyRow[]>;
  registerToolbarButton(spec: ToolbarButtonSpec): () => void;
  onSelectionChange(cb: (ids: number[]) => void): () => void;
  destroy(): void;
}

export type ViewerAdapterFactory = (
  container: HTMLElement,
) => Promise<ViewerAdapter>;
