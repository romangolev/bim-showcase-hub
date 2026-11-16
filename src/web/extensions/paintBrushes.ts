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
  const selection = adapter.getSelection();
  if (selection.length === 0) return false;
  adapter.setThemingColor(selection, color);
  adapter.clearSelection?.();
  return true;
}

export function resetPaint(adapter: ViewerAdapter): void {
  adapter.clearThemingColors();
}

function swatchIcon(color: string): string {
  return `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="7" fill="${color}"/></svg>`;
}

const RESET_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 12a7 7 0 1 0 2-5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4 4v4h4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';

export function registerPaintBrushes(adapter: ViewerAdapter): () => void {
  const disposers = [
    ...PAINT_PRESETS.map((preset) =>
      adapter.registerToolbarButton({
        id: preset.id,
        tooltip: preset.label,
        icon: swatchIcon(preset.swatch),
        onClick: () => {
          paintSelection(adapter, preset.color);
        },
      }),
    ),
    adapter.registerToolbarButton({
      id: 'paint-reset',
      tooltip: RESET_PAINT_LABEL,
      icon: RESET_ICON,
      onClick: () => resetPaint(adapter),
    }),
  ];
  return () => {
    for (const dispose of disposers) dispose();
  };
}
