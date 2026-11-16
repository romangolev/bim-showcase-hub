import type { Rgba, ViewerAdapter } from '../viewer/ViewerAdapter.js';

export interface PaintPreset {
  id: string;
  colorName: string;
  label: string;
  color: Rgba;
  swatch: string;
}

export const PAINT_PRESETS: readonly PaintPreset[] = [
  {
    id: 'paint-red',
    colorName: 'Red',
    label: 'Paint selected items in red',
    color: [1, 0, 0, 0.5],
    swatch: '#ef4444',
  },
  {
    id: 'paint-green',
    colorName: 'Green',
    label: 'Paint selected items in green',
    color: [0, 1, 0, 0.5],
    swatch: '#22c55e',
  },
  {
    id: 'paint-blue',
    colorName: 'Blue',
    label: 'Paint selected items in blue',
    color: [0, 0, 1, 0.5],
    swatch: '#3b82f6',
  },
];

export const RESET_PAINT_LABEL = 'Reset appearance';

export function paintSelection(adapter: ViewerAdapter, color: Rgba): boolean {
  const selection = adapter.getModelSelection();
  if (selection.length === 0) return false;
  adapter.setModelThemingColor(selection, color);
  adapter.clearSelection?.();
  return true;
}

export function resetPaint(adapter: ViewerAdapter): void {
  adapter.clearThemingColors();
}
