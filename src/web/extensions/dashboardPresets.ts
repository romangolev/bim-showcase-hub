import type { PropertyRow } from '../../shared/types.js';
import { availableProperties } from './dashboardData.js';

export interface DashboardPreset {
  id: string;
  label: string;
  properties: readonly string[];
}

export const DASHBOARD_PRESETS: readonly DashboardPreset[] = [
  {
    id: 'health',
    label: 'Model health',
    properties: ['Category', 'Level', 'Assembly Code', 'Classification Code'],
  },
  {
    id: 'discipline',
    label: 'By discipline',
    properties: ['Discipline', 'Category'],
  },
  {
    id: 'quantities',
    label: 'Quantities by type',
    properties: ['Category', 'Family', 'Type Name'],
  },
  {
    id: 'classification',
    label: 'Classification coverage',
    properties: ['Classification Code', 'Assembly Code'],
  },
];

export const PRESET_PROPERTIES: readonly string[] = [
  ...new Set(DASHBOARD_PRESETS.flatMap((preset) => preset.properties)),
];

export function presetCharts(
  preset: DashboardPreset,
  rows: readonly PropertyRow[],
): string[] {
  return availableProperties(rows, preset.properties);
}
