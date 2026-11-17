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

export const DEFAULT_PAINT_PALETTE: readonly string[] = PAINT_PRESETS.map(
  (preset) => preset.swatch,
);
export const DEFAULT_PAINT_INTENSITY = 0.5;
export const MAX_PAINT_SWATCHES = 8;
export const NEW_SWATCH_COLOR = '#f59e0b';
export const PALETTE_ICON = 'paint-swatch';

const HEX = /^#[0-9a-f]{6}$/i;

export function sanitizePalette(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_PAINT_PALETTE];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item === 'string' && HEX.test(item)) {
      seen.add(item.toLowerCase());
    }
  }
  const palette = [...seen].slice(0, MAX_PAINT_SWATCHES);
  return palette.length > 0 ? palette : [...DEFAULT_PAINT_PALETTE];
}

export function sanitizeIntensity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_PAINT_INTENSITY;
  }
  return Math.round(Math.min(1, Math.max(0.1, value)) * 20) / 20;
}

export function hexToRgba(hex: string, intensity: number): Rgba {
  const channel = (offset: number) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return [channel(1), channel(3), channel(5), intensity];
}

export function paletteToPresets(
  palette: readonly string[],
  intensity: number,
): PaintPreset[] {
  const seen = new Set<string>();
  return palette.map((hex, index) => {
    const base = `paint-${hex.slice(1)}`;
    const id = seen.has(base) ? `${base}-${index}` : base;
    seen.add(id);
    const known = PAINT_PRESETS.find((preset) => preset.swatch === hex);
    const colorName = known?.colorName ?? hex.toUpperCase();
    return {
      id,
      colorName,
      label: `Paint selected items in ${known ? colorName.toLowerCase() : colorName}`,
      color: hexToRgba(hex, intensity),
      swatch: hex,
    };
  });
}

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
