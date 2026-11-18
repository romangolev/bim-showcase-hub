import { flag } from '../../shared/guards.js';
import type { PropertyRow } from '../../shared/types.js';
import {
  type ElementScope,
  sanitizeElementScope,
} from '../viewer/propertyScope.js';
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

export function viewProperties(view: DashboardView): readonly string[] {
  const preset = DASHBOARD_PRESETS.find((p) => p.id === view.preset);
  return preset ? preset.properties : [view.property];
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
  pngTitle: boolean;
  pngLegend: boolean;
  scope?: string;
  elements?: ElementScope;
}

export const DEFAULT_DASHBOARD_VIEW: DashboardView = {
  preset: null,
  property: DEFAULT_DASHBOARD_PROPERTIES[0] ?? '',
  maxCategories: DEFAULT_MAX_CATEGORIES,
  kind: 'both',
  pngTitle: true,
  pngLegend: true,
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
    pngTitle: flag(source.pngTitle, true),
    pngLegend: flag(source.pngLegend, true),
    ...(typeof source.scope === 'string' && source.scope
      ? { scope: source.scope }
      : {}),
    ...(sanitizeElementScope(source.elements) !== 'all'
      ? { elements: sanitizeElementScope(source.elements) }
      : {}),
  };
}
