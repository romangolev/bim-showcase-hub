import { flag } from '../../shared/guards.js';
import type { PropertyRow } from '../../shared/types.js';
import { defineSavedKind } from '../store/savedKinds.js';
import {
  type ElementScope,
  sanitizeElementScope,
} from '../viewer/propertyScope.js';
import {
  type Aggregate,
  availableProperties,
  CHART_TYPE_LABELS,
  DEFAULT_DASHBOARD_PROPERTIES,
  DEFAULT_MAX_CATEGORIES,
  DEFAULT_TOP_N,
  sanitizeAggregate,
  TOP_N_MAX,
  TOP_N_MIN,
} from './dashboardData.js';
import { sanitizePropertyNames } from './propertyNames.js';

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
  return preset ? preset.properties : view.properties;
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

export const DASHBOARD_CHART_TYPES = [
  'bar',
  'hbar',
  'doughnut',
  'both',
  'table',
] as const;
export type DashboardChartType = (typeof DASHBOARD_CHART_TYPES)[number];
export const DASHBOARD_CHART_TYPE_LABELS: Record<DashboardChartType, string> = {
  ...CHART_TYPE_LABELS,
  both: 'Bar and doughnut',
};

export interface DashboardChartSpec {
  chartType: DashboardChartType;
  aggregate: Aggregate;
  measure: string;
  topN: number;
  otherBucket: boolean;
}

export interface DashboardView extends Partial<DashboardChartSpec> {
  preset: string | null;
  property: string;
  properties: readonly string[];
  maxCategories: number;
  kind: DashboardKind;
  pngTitle: boolean;
  pngLegend: boolean;
  scope?: string;
  elements?: ElementScope;
  splitByModel?: boolean;
}

export const DEFAULT_DASHBOARD_VIEW: DashboardView = {
  preset: null,
  property: DEFAULT_DASHBOARD_PROPERTIES[0] ?? '',
  properties: DEFAULT_DASHBOARD_PROPERTIES,
  maxCategories: DEFAULT_MAX_CATEGORIES,
  kind: 'both',
  chartType: 'both',
  aggregate: 'count',
  measure: '',
  topN: DEFAULT_TOP_N,
  otherBucket: true,
  pngTitle: true,
  pngLegend: true,
};

export function kindForChartType(type: DashboardChartType): DashboardKind {
  return type === 'doughnut' || type === 'both' ? type : 'bar';
}

export function chartTypeForKind(kind: DashboardKind): DashboardChartType {
  return kind;
}

export function withChartType(
  view: DashboardView,
  chartType: DashboardChartType,
): DashboardView {
  return { ...view, chartType, kind: kindForChartType(chartType) };
}

export function viewSpec(view: DashboardView): DashboardChartSpec {
  return {
    chartType: view.chartType ?? chartTypeForKind(view.kind),
    aggregate: view.aggregate ?? 'count',
    measure: view.measure ?? '',
    topN: view.topN ?? view.maxCategories,
    otherBucket: view.otherBucket ?? true,
  };
}

export function sanitizeDashboardView(raw: unknown): DashboardView {
  const source =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const max = Math.floor(Number(source.maxCategories));
  const maxCategories =
    Number.isFinite(max) && max >= MIN_CATEGORIES
      ? Math.min(max, MAX_CATEGORIES)
      : DEFAULT_MAX_CATEGORIES;
  const kind = CHART_KINDS.find((k) => k === source.kind) ?? 'both';
  const chartType: DashboardChartType =
    source.chartType === 'bar' && kind === 'both'
      ? 'both'
      : (DASHBOARD_CHART_TYPES.find((type) => type === source.chartType) ??
        chartTypeForKind(kind));
  const top = Math.floor(Number(source.topN));
  return {
    preset: DASHBOARD_PRESETS.some((p) => p.id === source.preset)
      ? (source.preset as string)
      : null,
    property:
      typeof source.property === 'string' && source.property.trim() !== ''
        ? source.property
        : DEFAULT_DASHBOARD_VIEW.property,
    properties: sanitizePropertyNames(
      source.properties,
      DEFAULT_DASHBOARD_PROPERTIES,
    ),
    maxCategories,
    kind: kindForChartType(chartType),
    chartType,
    aggregate: sanitizeAggregate(source.aggregate),
    measure: typeof source.measure === 'string' ? source.measure.trim() : '',
    topN:
      Number.isFinite(top) && top > 0
        ? Math.min(Math.max(top, TOP_N_MIN), TOP_N_MAX)
        : maxCategories,
    otherBucket: flag(source.otherBucket, true),
    pngTitle: flag(source.pngTitle, true),
    pngLegend: flag(source.pngLegend, true),
    ...(typeof source.scope === 'string' && source.scope
      ? { scope: source.scope }
      : {}),
    ...(sanitizeElementScope(source.elements) !== 'all'
      ? { elements: sanitizeElementScope(source.elements) }
      : {}),
    ...(flag(source.splitByModel, false) ? { splitByModel: true } : {}),
  };
}

export const DASHBOARD_PRESET_KIND = 'dashboard-preset';
type DashboardPresetData = {
  [K in keyof DashboardView]: DashboardView[K];
};

export const DASHBOARD_USER_PRESETS = defineSavedKind<DashboardPresetData>({
  kind: DASHBOARD_PRESET_KIND,
  version: 1,
  label: 'Dashboard preset',
  sanitize: (raw) => sanitizeDashboardView(raw),
});

export function saveDashboardPreset(name: string, view: DashboardView) {
  return DASHBOARD_USER_PRESETS.save(name, view) !== null;
}
