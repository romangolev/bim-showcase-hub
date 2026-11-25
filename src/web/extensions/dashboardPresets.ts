import { flag } from '../../shared/guards.js';
import { defineSavedKind } from '../store/savedKinds.js';
import {
  type Aggregate,
  CHART_TYPES,
  type ChartType,
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

export const MIN_CATEGORIES = 3;
export const MAX_CATEGORIES = 30;
export const MAX_CHARTS = 12;
export const MAX_CHART_NAME = 60;

export const DASHBOARD_ORIENTATIONS = ['vertical', 'horizontal'] as const;
export type DashboardOrientation = (typeof DASHBOARD_ORIENTATIONS)[number];
export const ORIENTATION_LABELS: Record<DashboardOrientation, string> = {
  vertical: 'Vertical',
  horizontal: 'Horizontal',
};

export interface DashboardChart {
  id: string;
  property: string;
  chartType: ChartType;
  dataLabels: boolean;
  name?: string;
}

export function chartTitle(chart: DashboardChart): string {
  return chart.name || chart.property;
}

export function nextChartId(charts: readonly DashboardChart[]): string {
  const used = new Set(charts.map((chart) => chart.id));
  let n = charts.length + 1;
  while (used.has(`c${n}`)) n += 1;
  return `c${n}`;
}

export function chartsFromProperties(
  properties: readonly string[],
  chartType: ChartType = 'bar',
): DashboardChart[] {
  return properties.slice(0, MAX_CHARTS).map((property, index) => ({
    id: `c${index + 1}`,
    property,
    chartType,
    dataLabels: false,
  }));
}

export function presetChartList(preset: DashboardPreset): DashboardChart[] {
  return chartsFromProperties(preset.properties);
}

export function chartsKey(charts: readonly DashboardChart[]): string {
  return JSON.stringify(
    charts.map((chart) => [
      chart.property,
      chart.chartType,
      chart.dataLabels,
      chart.name ?? '',
    ]),
  );
}

export function matchingPreset(
  charts: readonly DashboardChart[],
): DashboardPreset | undefined {
  const key = chartsKey(charts);
  return DASHBOARD_PRESETS.find(
    (preset) => chartsKey(presetChartList(preset)) === key,
  );
}

export interface DashboardChartSpec {
  aggregate: Aggregate;
  measure: string;
  topN: number;
  otherBucket: boolean;
}

export interface DashboardView extends Partial<DashboardChartSpec> {
  charts: readonly DashboardChart[];
  orientation: DashboardOrientation;
  sizes: readonly number[];
  properties: readonly string[];
  maxCategories: number;
  pngTitle: boolean;
  pngLegend: boolean;
  scope?: string;
  splitByModel?: boolean;
  controls?: boolean;
}

export function withControls(
  view: DashboardView,
  controls: boolean | undefined,
): DashboardView {
  const { controls: _previous, ...rest } = view;
  return controls === undefined ? rest : { ...rest, controls };
}

export const DEFAULT_DASHBOARD_VIEW: DashboardView = {
  charts: [
    {
      id: 'c1',
      property: DEFAULT_DASHBOARD_PROPERTIES[0] ?? '',
      chartType: 'bar',
      dataLabels: false,
    },
    {
      id: 'c2',
      property: DEFAULT_DASHBOARD_PROPERTIES[0] ?? '',
      chartType: 'doughnut',
      dataLabels: false,
    },
  ],
  orientation: 'horizontal',
  sizes: [],
  properties: DEFAULT_DASHBOARD_PROPERTIES,
  maxCategories: DEFAULT_MAX_CATEGORIES,
  aggregate: 'count',
  measure: '',
  topN: DEFAULT_TOP_N,
  otherBucket: true,
  pngTitle: true,
  pngLegend: true,
};

export function viewSpec(view: DashboardView): DashboardChartSpec {
  return {
    aggregate: view.aggregate ?? 'count',
    measure: view.measure ?? '',
    topN: view.topN ?? view.maxCategories,
    otherBucket: view.otherBucket ?? true,
  };
}

export function withCharts(
  view: DashboardView,
  charts: readonly DashboardChart[],
): DashboardView {
  return { ...view, charts, sizes: [] };
}

export function patchChart(
  view: DashboardView,
  id: string,
  patch: Partial<Omit<DashboardChart, 'id'>>,
): DashboardView {
  return {
    ...view,
    charts: view.charts.map((chart) =>
      chart.id === id ? { ...chart, ...patch } : chart,
    ),
  };
}

export function addChart(view: DashboardView): DashboardView {
  if (view.charts.length >= MAX_CHARTS) return view;
  const property =
    view.charts[view.charts.length - 1]?.property ??
    view.properties[0] ??
    DEFAULT_DASHBOARD_PROPERTIES[0] ??
    '';
  return withCharts(view, [
    ...view.charts,
    {
      id: nextChartId(view.charts),
      property,
      chartType: 'bar',
      dataLabels: false,
    },
  ]);
}

export function removeChart(view: DashboardView, id: string): DashboardView {
  return withCharts(
    view,
    view.charts.filter((chart) => chart.id !== id),
  );
}

const LEGACY_TYPES = ['bar', 'hbar', 'doughnut', 'both', 'table'] as const;
const LEGACY_KINDS = ['bar', 'doughnut', 'both'] as const;

function legacyCharts(
  source: Record<string, unknown>,
  pool: readonly string[],
): DashboardChart[] {
  const kind = LEGACY_KINDS.find((k) => k === source.kind);
  const raw = LEGACY_TYPES.find((type) => type === source.chartType);
  const type =
    raw === 'bar' && (kind ?? 'both') === 'both'
      ? 'both'
      : (raw ?? kind ?? 'both');
  const preset = DASHBOARD_PRESETS.find((p) => p.id === source.preset);
  if (preset) {
    return chartsFromProperties(
      preset.properties,
      type === 'both' ? 'bar' : type,
    );
  }
  const property =
    typeof source.property === 'string' && source.property.trim() !== ''
      ? source.property
      : (pool[0] ?? DEFAULT_DASHBOARD_PROPERTIES[0] ?? '');
  return (type === 'both' ? (['bar', 'doughnut'] as const) : [type]).map(
    (chartType, index) => ({
      id: `c${index + 1}`,
      property,
      chartType,
      dataLabels: false,
    }),
  );
}

function sanitizeCharts(raw: unknown): DashboardChart[] {
  if (!Array.isArray(raw)) return [];
  const charts: DashboardChart[] = [];
  for (const item of raw.slice(0, MAX_CHARTS)) {
    if (typeof item !== 'object' || item === null) continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.property !== 'string' || entry.property.trim() === '') {
      continue;
    }
    const wanted = typeof entry.id === 'string' ? entry.id.trim() : '';
    const id =
      wanted && !charts.some((chart) => chart.id === wanted)
        ? wanted.slice(0, 32)
        : nextChartId(charts);
    const name =
      typeof entry.name === 'string'
        ? entry.name.trim().slice(0, MAX_CHART_NAME)
        : '';
    charts.push({
      id,
      property: entry.property,
      chartType: CHART_TYPES.find((type) => type === entry.chartType) ?? 'bar',
      dataLabels: flag(entry.dataLabels, false),
      ...(name ? { name } : {}),
    });
  }
  return charts;
}

export function sanitizeSizes(raw: unknown, count: number): number[] {
  if (!Array.isArray(raw) || raw.length !== count) return [];
  const sizes = raw.map(Number);
  if (!sizes.every((size) => Number.isFinite(size) && size > 0)) return [];
  const total = sizes.reduce((sum, size) => sum + size, 0);
  return sizes.map((size) => size / total);
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
  const properties = sanitizePropertyNames(
    source.properties,
    DEFAULT_DASHBOARD_PROPERTIES,
  );
  const charts = Array.isArray(source.charts)
    ? sanitizeCharts(source.charts)
    : sanitizeCharts(legacyCharts(source, properties));
  const top = Math.floor(Number(source.topN));
  return {
    charts,
    orientation:
      DASHBOARD_ORIENTATIONS.find((o) => o === source.orientation) ??
      DEFAULT_DASHBOARD_VIEW.orientation,
    sizes: sanitizeSizes(source.sizes, charts.length),
    properties,
    maxCategories,
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
    ...(flag(source.splitByModel, false) ? { splitByModel: true } : {}),
    ...(typeof source.controls === 'boolean'
      ? { controls: source.controls }
      : {}),
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

export function saveDashboardPreset(
  name: string,
  view: DashboardView,
  id?: string,
) {
  return DASHBOARD_USER_PRESETS.save(name, view, id) !== null;
}
