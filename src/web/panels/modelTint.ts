import { hexToRgba } from '../extensions/paintBrushes.js';
import { BSH_KEYS, defineRecord } from '../storage.js';
import { colorLayersFor } from '../viewer/colorLayers.js';
import type { Rgba, ViewerAdapter } from '../viewer/ViewerAdapter.js';

export interface TintSwatch {
  hex: string;
  name: string;
}

export const TINT_SWATCHES: readonly TintSwatch[] = [
  { hex: '#3b82f6', name: 'Blue' },
  { hex: '#f97316', name: 'Orange' },
  { hex: '#22c55e', name: 'Green' },
  { hex: '#a855f7', name: 'Purple' },
  { hex: '#eab308', name: 'Yellow' },
  { hex: '#ef4444', name: 'Red' },
  { hex: '#14b8a6', name: 'Teal' },
  { hex: '#64748b', name: 'Slate' },
];

export const DEFAULT_TINT_PALETTE: readonly string[] = TINT_SWATCHES.map(
  (swatch) => swatch.hex,
);

export const DEFAULT_TINT_STRENGTH = 0.5;
export const MIN_TINT_STRENGTH = 0.1;
export const MAX_TINT_STRENGTH = 1;
export const TINT_STRENGTH_STEP = 0.05;
export const MAX_TINT_PALETTE = 8;
export const MAX_TINT_SETS = 64;

const HEX = /^#[0-9a-f]{6}$/i;

export interface ModelTint {
  color: string;
  strength: number;
}

export interface ModelTintState {
  palette: string[];
  palettes: Record<string, string[]>;
  tints: Record<string, ModelTint>;
  strength: number;
  ghostOthers: boolean;
}

export const INITIAL_MODEL_TINTS: ModelTintState = {
  palette: [...DEFAULT_TINT_PALETTE],
  palettes: {},
  tints: {},
  strength: DEFAULT_TINT_STRENGTH,
  ghostOthers: false,
};

export function clampTintStrength(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_TINT_STRENGTH;
  }
  const clamped = Math.min(
    MAX_TINT_STRENGTH,
    Math.max(MIN_TINT_STRENGTH, value),
  );
  return Math.round(clamped / TINT_STRENGTH_STEP) * TINT_STRENGTH_STEP;
}

export function sanitizeTintPalette(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_TINT_PALETTE];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry === 'string' && HEX.test(entry)) {
      seen.add(entry.toLowerCase());
    }
  }
  const palette = [...seen].slice(0, MAX_TINT_PALETTE);
  return palette.length > 0 ? palette : [...DEFAULT_TINT_PALETTE];
}

function sanitizeTint(value: unknown): ModelTint | null {
  if (typeof value !== 'object' || value === null) return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.color !== 'string' || !HEX.test(entry.color)) return null;
  return {
    color: entry.color.toLowerCase(),
    strength: clampTintStrength(entry.strength),
  };
}

export function sanitizeModelTints(raw: unknown): ModelTintState {
  if (typeof raw !== 'object' || raw === null) return INITIAL_MODEL_TINTS;
  const record = raw as Record<string, unknown>;
  const palettes: Record<string, string[]> = {};
  if (typeof record.palettes === 'object' && record.palettes !== null) {
    for (const [key, value] of Object.entries(
      record.palettes as Record<string, unknown>,
    ).slice(0, MAX_TINT_SETS)) {
      if (key) palettes[key] = sanitizeTintPalette(value);
    }
  }
  const tints: Record<string, ModelTint> = {};
  if (typeof record.tints === 'object' && record.tints !== null) {
    for (const [modelId, value] of Object.entries(
      record.tints as Record<string, unknown>,
    )) {
      const tint = sanitizeTint(value);
      if (modelId && tint) tints[modelId] = tint;
    }
  }
  return {
    palette: sanitizeTintPalette(record.palette),
    palettes,
    tints,
    strength: clampTintStrength(record.strength),
    ghostOthers: record.ghostOthers === true,
  };
}

export const MODEL_TINTS = defineRecord<ModelTintState>({
  key: BSH_KEYS.personal.modelTints,
  initial: INITIAL_MODEL_TINTS,
  sanitize: sanitizeModelTints,
});

export function tintPaletteFor(
  state: ModelTintState,
  setKey: string | null | undefined,
): string[] {
  const stored = setKey ? state.palettes[setKey] : undefined;
  return stored ?? state.palette;
}

export function withTintPalette(
  state: ModelTintState,
  setKey: string | null | undefined,
  palette: readonly string[],
): ModelTintState {
  const clean = sanitizeTintPalette(palette);
  if (!setKey) return { ...state, palette: clean };
  return { ...state, palettes: { ...state.palettes, [setKey]: clean } };
}

export function withoutTintPalette(
  state: ModelTintState,
  setKey: string | null | undefined,
): ModelTintState {
  if (!setKey) return { ...state, palette: [...DEFAULT_TINT_PALETTE] };
  const { [setKey]: _dropped, ...palettes } = state.palettes;
  return { ...state, palettes };
}

export function tintFor(
  state: ModelTintState,
  modelId: string,
): ModelTint | null {
  return state.tints[modelId] ?? null;
}

export function withModelTint(
  state: ModelTintState,
  modelId: string,
  tint: ModelTint | null,
): ModelTintState {
  const { [modelId]: _previous, ...tints } = state.tints;
  return {
    ...state,
    strength: tint ? clampTintStrength(tint.strength) : state.strength,
    tints: tint
      ? {
          ...tints,
          [modelId]: {
            color: tint.color.toLowerCase(),
            strength: clampTintStrength(tint.strength),
          },
        }
      : tints,
  };
}

export function withGhostOthers(
  state: ModelTintState,
  ghostOthers: boolean,
): ModelTintState {
  return { ...state, ghostOthers };
}

export function tintColor(tint: ModelTint): Rgba {
  return hexToRgba(tint.color, clampTintStrength(tint.strength));
}

export function tintName(hex: string): string {
  const known = TINT_SWATCHES.find(
    (swatch) => swatch.hex === hex.toLowerCase(),
  );
  return known?.name ?? hex.toUpperCase();
}

async function visibleIds(
  adapter: ViewerAdapter,
  modelId: string,
): Promise<number[]> {
  const items = await adapter.getVisible();
  return items.filter((item) => item.modelId === modelId).map((i) => i.dbId);
}

export async function applyModelTint(
  adapter: ViewerAdapter,
  modelId: string,
  tint: ModelTint,
): Promise<void> {
  const dbIds = await visibleIds(adapter, modelId);
  colorLayersFor(adapter).replaceModel(
    'modelTint',
    modelId,
    dbIds,
    tintColor(tint),
  );
}

export function clearModelTint(adapter: ViewerAdapter, modelId: string): void {
  colorLayersFor(adapter).clearModel('modelTint', modelId);
}

export function resetTintLayer(adapter: ViewerAdapter): void {
  colorLayersFor(adapter).clearSource('modelTint');
}

export async function applyGhostOthers(
  adapter: ViewerAdapter,
  modelId: string,
): Promise<void> {
  adapter.setGhosting?.(true);
  const items = (await adapter.getVisible()).filter(
    (item) => item.modelId === modelId,
  );
  if (items.length > 0) adapter.isolateModelIds(items);
}

export function resetGhostOthers(adapter: ViewerAdapter): void {
  adapter.showAll();
  adapter.setGhosting?.(false);
}
