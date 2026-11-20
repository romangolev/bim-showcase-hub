import { flag, isRecord } from '../../shared/guards.js';
import type { ChartPaletteId } from '../extensions/dashboardData.js';
import {
  BSH_KEYS,
  defineRecord,
  type PersistedRecord,
  usePersisted,
} from '../storage.js';

export const CHART_PALETTE_IDS = [
  'default',
  'okabe-ito',
  'viridis',
  'contrast',
] as const satisfies readonly ChartPaletteId[];

export const CHART_PALETTE_LABELS: Record<ChartPaletteId, string> = {
  default: 'Default',
  'okabe-ito': 'Okabe–Ito (colour-blind safe)',
  viridis: 'Viridis (colour-blind safe)',
  contrast: 'High contrast',
};

export interface ChartSettings {
  palette: ChartPaletteId;
  patterns: boolean;
  dataTable: boolean;
}

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  palette: 'default',
  patterns: false,
  dataTable: false,
};

export const CHART_SETTINGS: PersistedRecord<ChartSettings> =
  defineRecord<ChartSettings>({
    key: BSH_KEYS.preference.charts,
    initial: DEFAULT_CHART_SETTINGS,
    sanitize: (raw) => {
      const source = isRecord(raw) ? raw : {};
      return {
        palette:
          CHART_PALETTE_IDS.find((id) => id === source.palette) ??
          DEFAULT_CHART_SETTINGS.palette,
        patterns: flag(source.patterns, DEFAULT_CHART_SETTINGS.patterns),
        dataTable: flag(source.dataTable, DEFAULT_CHART_SETTINGS.dataTable),
      };
    },
  });

export function useChartSettings() {
  return usePersisted(CHART_SETTINGS);
}
