import { isRecord } from '../../../shared/guards.js';
import {
  DEFAULT_PAINT_INTENSITY,
  DEFAULT_PAINT_PALETTE,
  DEFAULT_PAINT_PALETTE_ID,
  type PaintPaletteId,
  sanitizeIntensity,
  sanitizePalette,
  sanitizePaletteId,
} from '../../extensions/paintBrushes.js';
import { defineRecord } from '../../storage.js';
import { readEnabled, type ToolSettings } from '../kernel/ViewerTool.js';

export interface PaintSettings extends ToolSettings {
  paletteId: PaintPaletteId;
  palette: string[];
  intensity: number;
  ghostRest: boolean;
}

export const PAINT_SETTINGS_KEY = 'bsh.tool.paint.v1';

export const DEFAULT_PAINT_SETTINGS: PaintSettings = {
  enabled: true,
  paletteId: DEFAULT_PAINT_PALETTE_ID,
  palette: [...DEFAULT_PAINT_PALETTE],
  intensity: DEFAULT_PAINT_INTENSITY,
  ghostRest: false,
};

export function readPaintSettings(raw: unknown): PaintSettings {
  const source = isRecord(raw) ? raw : {};
  return {
    enabled: readEnabled(source),
    paletteId: sanitizePaletteId(source.paletteId),
    palette: sanitizePalette(source.palette),
    intensity: sanitizeIntensity(source.intensity),
    ghostRest: source.ghostRest === true,
  };
}

export const PAINT_SETTINGS = defineRecord({
  key: PAINT_SETTINGS_KEY,
  initial: DEFAULT_PAINT_SETTINGS,
  sanitize: readPaintSettings,
});
