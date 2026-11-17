import type { PropertyRow } from '../../shared/types.js';
import {
  availableProperties,
  DEFAULT_DASHBOARD_PROPERTIES,
  DEFAULT_MAX_CATEGORIES,
} from './dashboardData.js';

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

export const CHART_KINDS = ['bar', 'doughnut', 'both'] as const;
export type DashboardKind = (typeof CHART_KINDS)[number];
export const KIND_LABELS: Record<DashboardKind, string> = {
  bar: 'Bar',
  doughnut: 'Doughnut',
  both: 'Both',
};
export const MIN_CATEGORIES = 3;
export const MAX_CATEGORIES = 30;

export interface DashboardView {
  preset: string | null;
  property: string;
  maxCategories: number;
  kind: DashboardKind;
}

export const DEFAULT_DASHBOARD_VIEW: DashboardView = {
  preset: null,
  property: DEFAULT_DASHBOARD_PROPERTIES[0] ?? '',
  maxCategories: DEFAULT_MAX_CATEGORIES,
  kind: 'both',
};

export function sanitizeDashboardView(raw: unknown): DashboardView {
  const source =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const max = Math.floor(Number(source.maxCategories));
  return {
    preset: DASHBOARD_PRESETS.some((p) => p.id === source.preset)
      ? (source.preset as string)
      : null,
    property:
      typeof source.property === 'string' &&
      DEFAULT_DASHBOARD_PROPERTIES.includes(source.property)
        ? source.property
        : DEFAULT_DASHBOARD_VIEW.property,
    maxCategories:
      Number.isFinite(max) && max >= MIN_CATEGORIES
        ? Math.min(max, MAX_CATEGORIES)
        : DEFAULT_MAX_CATEGORIES,
    kind: CHART_KINDS.find((k) => k === source.kind) ?? 'both',
  };
}
