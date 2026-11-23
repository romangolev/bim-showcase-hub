import { isRecord } from '../../shared/guards.js';
import type { PropertyRow } from '../../shared/types.js';
import { formatCount } from './exportCommon.js';
import { parseMeasure as parseQuantity } from './measureParse.js';

export { formatCount };

export const DEFAULT_SUMMARY_PROPERTIES: readonly string[] = [
  'Assembly Code',
  'Classification Code',
  'Name',
];

export const EMPTY_VALUE_LABEL = '(empty)';

export interface SummaryEntry {
  property: string;
  value: string;
  count: number;
}

export function formatValue(
  value: string | number | boolean | null | undefined,
): string {
  if (value === null || value === undefined || value === '') {
    return EMPTY_VALUE_LABEL;
  }
  return String(value);
}

export function summarize(
  rows: readonly PropertyRow[],
  propertyNames: readonly string[] = DEFAULT_SUMMARY_PROPERTIES,
): SummaryEntry[] {
  const entries: SummaryEntry[] = [];
  for (const property of propertyNames) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const value = formatValue(row.properties[property]);
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    for (const [value, count] of sorted) {
      entries.push({ property, value, count });
    }
  }
  return entries;
}

export type SummarySort = 'count' | 'value';
export type SummaryDensity = 'comfortable' | 'compact';

export const SUMMARY_LAYOUTS = ['flat', 'grouped', 'pivot'] as const;
export type SummaryLayout = (typeof SUMMARY_LAYOUTS)[number];

export const MAX_GROUP_BY = 4;
export const MAX_PRECISION = 4;
export const MAX_UNIT_LABEL = 16;
export const MAX_TITLE_LENGTH = 80;
export const MAX_SUMMARY_COLUMNS = 12;
export const MAX_SUMMARY_ROWS = 24;
export const MAX_PROPERTY_NAME = 120;
export const DEFAULT_PRECISION = 2;

export const SUMMARY_AGGREGATES = [
  'count',
  'filled',
  'empty',
  'distinct',
  'sum',
  'avg',
  'min',
  'max',
] as const;
export type SummaryAggregate = (typeof SUMMARY_AGGREGATES)[number];

export const NUMERIC_AGGREGATES: readonly SummaryAggregate[] = [
  'sum',
  'avg',
  'min',
  'max',
];

export const SUMMARY_AGGREGATE_LABELS: Record<SummaryAggregate, string> = {
  count: 'Count of values',
  filled: 'Filled %',
  empty: 'Empty %',
  distinct: 'Distinct values',
  sum: 'Sum',
  avg: 'Average',
  min: 'Minimum',
  max: 'Maximum',
};

const TITLE_PREFIX: Record<SummaryAggregate, string> = {
  count: 'Count of',
  filled: 'Filled % of',
  empty: 'Empty % of',
  distinct: 'Distinct values of',
  sum: 'Sum of',
  avg: 'Average of',
  min: 'Minimum of',
  max: 'Maximum of',
};

export type ColumnRef = {
  property: string | null;
  aggregate: SummaryAggregate;
};

export type SummaryColumnSpec = ColumnRef & {
  id: string;
  title: string;
  precision: number;
  unitLabel: string;
};

export const COUNT_COLUMN: SummaryColumnSpec = {
  id: 'count',
  property: null,
  aggregate: 'count',
  title: '',
  precision: 0,
  unitLabel: '',
};

export function sanitizeSummaryAggregate(raw: unknown): SummaryAggregate {
  return SUMMARY_AGGREGATES.find((name) => name === raw) ?? 'count';
}

export function columnId(ref: ColumnRef): string {
  return ref.property === null
    ? ref.aggregate
    : `${ref.aggregate}:${ref.property}`;
}

export function columnRef(id: string): ColumnRef {
  const at = id.indexOf(':');
  if (at < 0)
    return { property: null, aggregate: sanitizeSummaryAggregate(id) };
  return {
    property: id.slice(at + 1),
    aggregate: sanitizeSummaryAggregate(id.slice(0, at)),
  };
}

function clampPrecision(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0
    ? Math.min(MAX_PRECISION, Math.floor(raw))
    : DEFAULT_PRECISION;
}

function text(raw: unknown, max: number): string {
  return typeof raw === 'string' ? raw.trim().slice(0, max) : '';
}

export function summaryColumn(
  property: string,
  aggregate: SummaryAggregate,
  options: { title?: string; precision?: number; unitLabel?: string } = {},
): SummaryColumnSpec {
  const name = property.trim().slice(0, MAX_PROPERTY_NAME);
  return {
    id: columnId({ property: name, aggregate }),
    property: name,
    aggregate,
    title: text(options.title, MAX_TITLE_LENGTH),
    precision: clampPrecision(options.precision ?? DEFAULT_PRECISION),
    unitLabel: text(options.unitLabel, MAX_UNIT_LABEL),
  };
}

export function sanitizeColumns(raw: readonly unknown[]): SummaryColumnSpec[] {
  const columns: SummaryColumnSpec[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const aggregate = SUMMARY_AGGREGATES.find(
      (name) => name === item.aggregate,
    );
    if (!aggregate) continue;
    const property = text(item.property, MAX_PROPERTY_NAME);
    const column = property
      ? summaryColumn(property, aggregate, {
          title: text(item.title, MAX_TITLE_LENGTH),
          precision:
            typeof item.precision === 'number'
              ? item.precision
              : DEFAULT_PRECISION,
          unitLabel: text(item.unitLabel, MAX_UNIT_LABEL),
        })
      : aggregate === 'count'
        ? { ...COUNT_COLUMN, title: text(item.title, MAX_TITLE_LENGTH) }
        : null;
    if (!column || columns.some((existing) => existing.id === column.id)) {
      continue;
    }
    columns.push(column);
    if (columns.length === MAX_SUMMARY_COLUMNS) break;
  }
  return columns;
}

export function columnTitle(column: SummaryColumnSpec): string {
  const title = column.title.trim();
  if (title) return title;
  return column.property === null
    ? 'Count'
    : `${TITLE_PREFIX[column.aggregate]} ${column.property}`;
}

export interface SummaryView {
  hideEmpty: boolean;
  minCount: number;
  text: string;
  sort: SummarySort;
  density: SummaryDensity;
  autoRefresh: boolean;
  layout: SummaryLayout;
  groupBy: string[];
  titles: Record<string, string>;
  columns: SummaryColumnSpec[];
  showProperty: boolean;
}

export const DEFAULT_SUMMARY_VIEW: SummaryView = {
  hideEmpty: false,
  minCount: 1,
  text: '',
  sort: 'count',
  density: 'comfortable',
  autoRefresh: true,
  layout: 'flat',
  groupBy: [],
  titles: {},
  columns: [COUNT_COLUMN],
  showProperty: true,
};

export function viewEntries(
  entries: readonly SummaryEntry[],
  view: SummaryView,
): SummaryEntry[] {
  const needle = view.text.trim().toLowerCase();
  const kept = entries.filter(
    (entry) =>
      (!view.hideEmpty || entry.value !== EMPTY_VALUE_LABEL) &&
      entry.count >= view.minCount &&
      (!needle ||
        entry.value.toLowerCase().includes(needle) ||
        entry.property.toLowerCase().includes(needle)),
  );
  if (view.sort === 'count') return kept;
  const groups = new Map<string, SummaryEntry[]>();
  for (const entry of kept) {
    const group = groups.get(entry.property);
    if (group) group.push(entry);
    else groups.set(entry.property, [entry]);
  }
  return [...groups.values()].flatMap((group) =>
    group.sort((a, b) => a.value.localeCompare(b.value)),
  );
}

export function emptyShares(
  entries: readonly SummaryEntry[],
): { property: string; percent: number }[] {
  const totals = new Map<string, { empty: number; all: number }>();
  for (const { property, value, count } of entries) {
    const total = totals.get(property) ?? { empty: 0, all: 0 };
    total.all += count;
    if (value === EMPTY_VALUE_LABEL) total.empty += count;
    totals.set(property, total);
  }
  return [...totals].map(([property, { empty, all }]) => ({
    property,
    percent: all === 0 ? 0 : Math.round((empty / all) * 100),
  }));
}

export type MeasureFamily = 'area' | 'volume' | 'length' | 'none';

export interface ParsedMeasure {
  value: number;
  unit: string;
  family: MeasureFamily;
  factor: number;
}

const FAMILY_UNITS: Record<MeasureFamily, string> = {
  area: 'm²',
  volume: 'm³',
  length: 'm',
  none: '',
};

const PARSED_FAMILIES: Record<string, MeasureFamily> = {
  unitless: 'none',
  length: 'length',
  area: 'area',
  volume: 'volume',
};

export function parseMeasure(raw: unknown): ParsedMeasure | null {
  const parsed = parseQuantity(raw);
  const family = parsed && PARSED_FAMILIES[parsed.family];
  if (!parsed || !family) return null;
  return {
    value: parsed.value,
    unit: FAMILY_UNITS[family],
    family,
    factor: parsed.factor,
  };
}

export type SummaryCell =
  | { status: 'ok'; value: number; unit: string; missing: number }
  | { status: 'none' }
  | { status: 'mixed'; units: string[] };

const NO_CELL: SummaryCell = { status: 'none' };

function okCell(value: number, unit = '', missing = 0): SummaryCell {
  return { status: 'ok', value, unit, missing };
}

export function aggregateCell(
  rows: readonly PropertyRow[],
  ref: ColumnRef,
): SummaryCell {
  const { property, aggregate } = ref;
  if (property === null) return okCell(rows.length);
  if (!NUMERIC_AGGREGATES.includes(aggregate)) {
    const values = rows
      .map((row) => formatValue(row.properties[property]))
      .filter((value) => value !== EMPTY_VALUE_LABEL);
    if (aggregate === 'distinct') return okCell(new Set(values).size);
    if (aggregate === 'count') return okCell(values.length);
    if (rows.length === 0) return NO_CELL;
    const share = (values.length / rows.length) * 100;
    return okCell(aggregate === 'filled' ? share : 100 - share);
  }
  const families = new Set<MeasureFamily>();
  const numbers: number[] = [];
  for (const row of rows) {
    const parsed = parseMeasure(row.properties[property]);
    if (!parsed) continue;
    families.add(parsed.family);
    numbers.push(parsed.value * parsed.factor);
  }
  if (families.size > 1) {
    return {
      status: 'mixed',
      units: [...families]
        .map((family) => FAMILY_UNITS[family] || 'number')
        .sort(),
    };
  }
  const family = [...families][0];
  if (family === undefined) return NO_CELL;
  const total = numbers.reduce((sum, value) => sum + value, 0);
  const value =
    aggregate === 'sum'
      ? total
      : aggregate === 'avg'
        ? total / numbers.length
        : numbers.reduce(
            (best, next) =>
              aggregate === 'min' ? Math.min(best, next) : Math.max(best, next),
            aggregate === 'min'
              ? Number.POSITIVE_INFINITY
              : Number.NEGATIVE_INFINITY,
          );
  return okCell(value, FAMILY_UNITS[family], rows.length - numbers.length);
}

function groupRows(
  rows: readonly PropertyRow[],
  property: string,
): Map<string, PropertyRow[]> {
  const groups = new Map<string, PropertyRow[]>();
  for (const row of rows) {
    const value = formatValue(row.properties[property]);
    const group = groups.get(value);
    if (group) group.push(row);
    else groups.set(value, [row]);
  }
  return groups;
}

export function columnCells(
  rows: readonly PropertyRow[],
  rowProperty: string,
  columns: readonly ColumnRef[],
): Map<string, SummaryCell[]> {
  return new Map(
    [...groupRows(rows, rowProperty)].map(([value, group]) => [
      value,
      columns.map((column) => aggregateCell(group, column)),
    ]),
  );
}

export function entryCells(
  entry: SummaryEntry,
  columns: readonly ColumnRef[],
  computed: readonly SummaryCell[] | undefined,
): SummaryCell[] {
  return columns.map((column, index) =>
    column.property === null
      ? okCell(entry.count)
      : (computed?.[index] ?? NO_CELL),
  );
}

export function formatCell(
  cell: SummaryCell,
  column: SummaryColumnSpec,
): string {
  if (cell.status === 'none') return 'n/a';
  if (cell.status === 'mixed') return 'mixed units';
  if (
    column.property === null ||
    column.aggregate === 'count' ||
    column.aggregate === 'distinct'
  ) {
    return formatCount(cell.value);
  }
  if (column.aggregate === 'filled' || column.aggregate === 'empty') {
    return `${Math.round(cell.value)}%`;
  }
  const number = cell.value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: column.precision,
  });
  const unit = column.unitLabel || cell.unit;
  const label = unit ? `${number} ${unit}` : number;
  return cell.missing > 0
    ? `${label} (${formatCount(cell.missing)} missing)`
    : label;
}

export interface PivotNode {
  value: string;
  count: number;
  children: PivotNode[];
  cells: SummaryCell[];
}

function orderByCount<T extends { value: string; count: number }>(
  nodes: T[],
): T[] {
  return nodes.sort(
    (a, b) => b.count - a.count || a.value.localeCompare(b.value),
  );
}

export function pivotTree(
  rows: readonly PropertyRow[],
  groupBy: readonly string[],
  options: { columns?: readonly ColumnRef[] } = {},
): PivotNode[] {
  const names = sanitizeGroupBy(groupBy);
  if (names.length === 0) return [];
  const columns = options.columns ?? [];
  const build = (
    subset: readonly PropertyRow[],
    depth: number,
  ): PivotNode[] => {
    const name = names[depth];
    if (!name) return [];
    return orderByCount(
      [...groupRows(subset, name)].map(([value, group]) => ({
        value,
        count: group.length,
        children: build(group, depth + 1),
        cells: columns.map((column) => aggregateCell(group, column)),
      })),
    );
  };
  return build(rows, 0);
}

export interface SummaryBlock {
  property: string;
  entries: SummaryEntry[];
}

export function summaryBlocks(
  entries: readonly SummaryEntry[],
): SummaryBlock[] {
  const blocks = new Map<string, SummaryEntry[]>();
  for (const entry of entries) {
    const block = blocks.get(entry.property);
    if (block) block.push(entry);
    else blocks.set(entry.property, [entry]);
  }
  return [...blocks].map(([property, blockEntries]) => ({
    property,
    entries: blockEntries,
  }));
}

export function blockTitle(
  titles: Record<string, string>,
  property: string,
): string {
  const title = titles[property];
  return typeof title === 'string' && title.trim() ? title.trim() : property;
}

export function countShare(count: number, max: number): number {
  if (!Number.isFinite(count) || !Number.isFinite(max) || max <= 0) return 0;
  if (count <= 0) return 0;
  return Math.min(100, Math.round((count / max) * 100));
}

export function sanitizeLayout(raw: unknown): SummaryLayout {
  return (
    SUMMARY_LAYOUTS.find((name) => name === raw) ?? DEFAULT_SUMMARY_VIEW.layout
  );
}

export function sanitizeGroupBy(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const names: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const name = item.trim();
    if (!name || names.includes(name)) continue;
    names.push(name);
    if (names.length === MAX_GROUP_BY) break;
  }
  return names;
}

export function sanitizeTitles(raw: unknown): Record<string, string> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const entries: [string, string][] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string') continue;
    const property = key.trim();
    const title = value.trim().slice(0, MAX_TITLE_LENGTH);
    if (!property || !title) continue;
    entries.push([property, title]);
  }
  return Object.fromEntries(entries);
}

function legacyColumns(
  source: Record<string, unknown>,
  hidden: readonly unknown[],
): SummaryColumnSpec[] {
  const measure = text(source.measure, MAX_PROPERTY_NAME);
  return [
    ...(hidden.includes('count') ? [] : [COUNT_COLUMN]),
    ...(measure
      ? [
          summaryColumn(measure, 'sum', {
            precision:
              typeof source.precision === 'number'
                ? source.precision
                : DEFAULT_PRECISION,
            unitLabel: text(source.unitLabel, MAX_UNIT_LABEL),
          }),
        ]
      : []),
  ];
}

export function sanitizeView(raw: unknown): SummaryView {
  const source =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const minCount = Number(source.minCount);
  const hidden = Array.isArray(source.hiddenColumns)
    ? source.hiddenColumns
    : [];
  return {
    hideEmpty: source.hideEmpty === true,
    minCount:
      Number.isFinite(minCount) && minCount >= 1 ? Math.floor(minCount) : 1,
    text: typeof source.text === 'string' ? source.text : '',
    sort: source.sort === 'value' ? 'value' : 'count',
    density: source.density === 'compact' ? 'compact' : 'comfortable',
    autoRefresh:
      typeof source.autoRefresh === 'boolean' ? source.autoRefresh : true,
    layout: sanitizeLayout(source.layout),
    groupBy: sanitizeGroupBy(source.groupBy),
    titles: sanitizeTitles(source.titles),
    columns: Array.isArray(source.columns)
      ? sanitizeColumns(source.columns)
      : legacyColumns(source, hidden),
    showProperty:
      typeof source.showProperty === 'boolean'
        ? source.showProperty
        : !hidden.includes('property'),
  };
}

export function summaryTable(
  entries: readonly SummaryEntry[],
  view: Pick<SummaryView, 'columns' | 'showProperty'>,
  rows: readonly PropertyRow[],
): { header: string[]; rows: (string | number)[][] } {
  const { columns, showProperty } = view;
  const cells = new Map<string, SummaryCell[]>();
  for (const property of new Set(entries.map((entry) => entry.property))) {
    for (const [value, list] of columnCells(rows, property, columns)) {
      cells.set(`${property}\u0000${value}`, list);
    }
  }
  return {
    header: [
      ...(showProperty ? ['Property'] : []),
      'Value',
      ...columns.map(columnTitle),
    ],
    rows: entries.map((entry) => {
      const list = entryCells(
        entry,
        columns,
        cells.get(`${entry.property}\u0000${entry.value}`),
      );
      return [
        ...(showProperty ? [entry.property] : []),
        entry.value,
        ...columns.map((column, index): string | number => {
          const cell = list[index] ?? NO_CELL;
          const countLike =
            column.property === null ||
            column.aggregate === 'count' ||
            column.aggregate === 'distinct';
          return cell.status === 'ok' && countLike
            ? cell.value
            : formatCell(cell, column);
        }),
      ];
    }),
  };
}

export type SummaryAddition =
  | { role: 'rows'; property: string }
  | { role: 'column'; column: SummaryColumnSpec };

export function applyAddition(
  properties: readonly string[],
  columns: readonly SummaryColumnSpec[],
  addition: SummaryAddition,
  editing?: SummaryAddition,
): { properties: string[]; columns: SummaryColumnSpec[] } {
  if (addition.role === 'rows') {
    const name = addition.property.trim();
    return {
      properties:
        editing?.role === 'rows'
          ? properties.map((item) => (item === editing.property ? name : item))
          : [...properties, name],
      columns: [...columns],
    };
  }
  return {
    properties: [...properties],
    columns:
      editing?.role === 'column'
        ? columns.map((item) =>
            item.id === editing.column.id ? addition.column : item,
          )
        : [...columns, addition.column],
  };
}

export function additionProblem(
  addition: SummaryAddition,
  rows: readonly string[],
  columns: readonly SummaryColumnSpec[],
  editing?: SummaryAddition,
): string | null {
  if (addition.role === 'rows') {
    const property = addition.property.trim();
    if (!property) return 'Choose a property';
    const others =
      editing?.role === 'rows'
        ? rows.filter((name) => name !== editing.property)
        : rows;
    if (others.includes(property)) return 'Already in the rows';
    if (!editing && rows.length >= MAX_SUMMARY_ROWS) {
      return `The summary holds up to ${MAX_SUMMARY_ROWS} row properties`;
    }
    return null;
  }
  const { column } = addition;
  if (!column.property) return 'Choose a property';
  const others =
    editing?.role === 'column'
      ? columns.filter((item) => item.id !== editing.column.id)
      : columns;
  if (others.some((item) => item.id === column.id)) {
    return 'This column already exists';
  }
  if (!editing && columns.length >= MAX_SUMMARY_COLUMNS) {
    return `The summary holds up to ${MAX_SUMMARY_COLUMNS} columns`;
  }
  return null;
}
