import type { Rgba, ViewerAdapter } from '../viewer/ViewerAdapter.js';

export interface PaintPreset {
  id: string;
  colorName: string;
  label: string;
  marker: string;
  color: Rgba;
  swatch: string;
}

export type PaintPaletteId =
  | 'default'
  | 'okabe-ito'
  | 'viridis'
  | 'contrast'
  | 'custom';

interface PaintPalette {
  id: PaintPaletteId;
  label: string;
  swatches: readonly { hex: string; name: string }[];
}

export const PAINT_PALETTES: readonly PaintPalette[] = [
  {
    id: 'default',
    label: 'Default',
    swatches: [
      { hex: '#ef4444', name: 'Red' },
      { hex: '#22c55e', name: 'Green' },
      { hex: '#3b82f6', name: 'Blue' },
    ],
  },
  {
    id: 'okabe-ito',
    label: 'Okabe–Ito (colour-blind safe)',
    swatches: [
      { hex: '#e69f00', name: 'Orange' },
      { hex: '#56b4e9', name: 'Sky blue' },
      { hex: '#009e73', name: 'Bluish green' },
      { hex: '#f0e442', name: 'Yellow' },
      { hex: '#0072b2', name: 'Blue' },
      { hex: '#d55e00', name: 'Vermillion' },
      { hex: '#cc79a7', name: 'Reddish purple' },
      { hex: '#000000', name: 'Black' },
    ],
  },
  {
    id: 'viridis',
    label: 'Viridis (colour-blind safe)',
    swatches: [
      { hex: '#440154', name: 'Viridis 1' },
      { hex: '#46327e', name: 'Viridis 2' },
      { hex: '#365c8d', name: 'Viridis 3' },
      { hex: '#277f8e', name: 'Viridis 4' },
      { hex: '#1fa187', name: 'Viridis 5' },
      { hex: '#4ac16d', name: 'Viridis 6' },
      { hex: '#a0da39', name: 'Viridis 7' },
      { hex: '#fde725', name: 'Viridis 8' },
    ],
  },
  {
    id: 'contrast',
    label: 'High contrast',
    swatches: [
      { hex: '#ffffff', name: 'White' },
      { hex: '#000000', name: 'Black' },
      { hex: '#ffff00', name: 'Yellow' },
      { hex: '#00ffff', name: 'Cyan' },
    ],
  },
  { id: 'custom', label: 'Custom swatches', swatches: [] },
];

const SWATCH_NAMES = new Map<string, string>();
for (const palette of PAINT_PALETTES) {
  for (const swatch of palette.swatches) {
    if (!SWATCH_NAMES.has(swatch.hex)) {
      SWATCH_NAMES.set(swatch.hex, swatch.name);
    }
  }
}

export const DEFAULT_PAINT_PALETTE_ID: PaintPaletteId = 'default';

const DEFAULT_SWATCHES =
  PAINT_PALETTES.find((palette) => palette.id === 'default')?.swatches ?? [];

export const PAINT_PRESETS: readonly PaintPreset[] = [
  {
    id: 'paint-ef4444',
    colorName: 'Red',
    label: 'Paint selected items in red (1)',
    marker: '1',
    color: [1, 0, 0, 0.5],
    swatch: '#ef4444',
  },
  {
    id: 'paint-22c55e',
    colorName: 'Green',
    label: 'Paint selected items in green (2)',
    marker: '2',
    color: [0, 1, 0, 0.5],
    swatch: '#22c55e',
  },
  {
    id: 'paint-3b82f6',
    colorName: 'Blue',
    label: 'Paint selected items in blue (3)',
    marker: '3',
    color: [0, 0, 1, 0.5],
    swatch: '#3b82f6',
  },
];

export const DEFAULT_PAINT_PALETTE: readonly string[] = DEFAULT_SWATCHES.map(
  (swatch) => swatch.hex,
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

export function sanitizePaletteId(value: unknown): PaintPaletteId {
  const match = PAINT_PALETTES.find((palette) => palette.id === value);
  return match?.id ?? DEFAULT_PAINT_PALETTE_ID;
}

export function resolvePaintPalette(
  paletteId: PaintPaletteId,
  custom: readonly string[],
): string[] {
  const named = PAINT_PALETTES.find((palette) => palette.id === paletteId);
  if (!named || named.id === 'custom') return sanitizePalette(custom);
  return named.swatches.map((swatch) => swatch.hex);
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
    const colorName = SWATCH_NAMES.get(hex.toLowerCase()) ?? hex.toUpperCase();
    const marker = String(index + 1);
    return {
      id,
      colorName,
      label: `Paint selected items in ${colorName.toLowerCase()} (${marker})`,
      marker,
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
  adapter.clearSelection();
  return true;
}

export function resetPaint(adapter: ViewerAdapter): void {
  adapter.clearThemingColors();
}
