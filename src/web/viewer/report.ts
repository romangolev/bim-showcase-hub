import type { PropertyRow } from '../../shared/types.js';
import { type ChartData, shapeChartData } from '../extensions/dashboardData.js';
import {
  formatCount,
  type SummaryEntry,
  type SummaryView,
  summarize,
  viewEntries,
} from '../extensions/modelSummary.js';
import { ALL_MODELS } from './modelScope.js';
import type { ElementScope } from './propertyScope.js';
import { readScopedRows } from './scopedRows.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

export const REPORT_MAX_PROPERTIES = 6;
export const REPORT_MAX_CHARTS = 3;
export const REPORT_VALUES_PER_PROPERTY = 8;

export interface ReportSection {
  property: string;
  entries: SummaryEntry[];
  more: number;
}

export interface ReportChart {
  property: string;
  total: number;
  data: ChartData['data'];
}

export interface ReportContent {
  title: string;
  version?: string;
  date: Date;
  elements: number;
  models: string[];
  sections: ReportSection[];
  charts: ReportChart[];
  unavailable: string[];
  image?: string | null;
}

export interface ReportRequest {
  title: string;
  version?: string;
  image?: string | null;
  names: readonly string[];
  chartProperties: readonly string[];
  maxCategories: number;
  elements?: ElementScope;
  view?: SummaryView;
  now?: Date;
}

function sectionsFor(
  rows: readonly PropertyRow[],
  names: readonly string[],
  view: SummaryView | undefined,
): ReportSection[] {
  const summarized = summarize(rows, names.slice(0, REPORT_MAX_PROPERTIES));
  const entries = view ? viewEntries(summarized, view) : summarized;
  const grouped = new Map<string, SummaryEntry[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.property);
    if (list) list.push(entry);
    else grouped.set(entry.property, [entry]);
  }
  return [...grouped].map(([property, list]) => ({
    property,
    entries: list.slice(0, REPORT_VALUES_PER_PROPERTY),
    more: Math.max(0, list.length - REPORT_VALUES_PER_PROPERTY),
  }));
}

export function buildReportContent(
  rows: readonly PropertyRow[],
  request: ReportRequest,
): ReportContent {
  const charts: ReportChart[] = [];
  const summarized = new Set(request.names.slice(0, REPORT_MAX_PROPERTIES));
  const chartable = [
    ...new Set(request.chartProperties.filter((p) => !summarized.has(p))),
  ];
  for (const property of chartable.slice(0, REPORT_MAX_CHARTS)) {
    const chart = shapeChartData(rows, property, request.maxCategories);
    if (chart.total > 0) charts.push(chart);
  }
  return {
    title: request.title,
    ...(request.version ? { version: request.version } : {}),
    date: request.now ?? new Date(),
    elements: rows.length,
    models: [],
    sections: sectionsFor(rows, request.names, request.view),
    charts,
    unavailable: [],
    image: request.image ?? null,
  };
}

export async function collectReport(
  adapter: ViewerAdapter,
  request: ReportRequest,
): Promise<ReportContent> {
  const names = [...new Set([...request.names, ...request.chartProperties])];
  const read = await readScopedRows(adapter, {
    names,
    models: ALL_MODELS,
    elements: request.elements ?? 'all',
  });
  const content = buildReportContent(read.rows, request);
  return {
    ...content,
    models: adapter.getModels().map((model) => model.name),
    unavailable: read.unavailable.map((model) => model.name),
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const REPORT_PRINT_STYLE = `
  :root { color-scheme: light }
  html, body { background: #fff }
  body { margin: 0; color: #1b1f24; font: 13px/1.45 system-ui, sans-serif }
  header h1 { margin: 0; font-size: 21px }
  .meta { margin: 4px 0 18px; color: #5a6572 }
  figure { margin: 0 0 20px }
  figure img { display: block; max-width: 100%; max-height: 110mm; border: 1px solid #d8dee6; border-radius: 6px }
  h2 { margin: 22px 0 6px; font-size: 15px }
  h3 { margin: 14px 0 4px; font-size: 13px }
  table { width: 100%; margin: 0 0 8px; border-collapse: collapse }
  th, td { padding: 3px 6px; text-align: left; border-bottom: 1px solid #e6eaef }
  th.count, td.count { width: 80px; text-align: right }
  .more { color: #5a6572 }
  section, tr { break-inside: avoid }
  @page { margin: 16mm }
`;

function dateText(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function sectionHtml(section: ReportSection): string {
  const rows = section.entries
    .map(
      (entry) =>
        `<tr><td>${escapeHtml(entry.value)}</td><td class="count">${formatCount(entry.count)}</td></tr>`,
    )
    .join('');
  const more =
    section.more > 0
      ? `<tr><td class="more" colspan="2">${section.more} more values</td></tr>`
      : '';
  return [
    '<section>',
    `<h3>${escapeHtml(section.property)}</h3>`,
    '<table><thead><tr><th>Value</th><th class="count">Count</th></tr></thead>',
    `<tbody>${rows}${more}</tbody></table>`,
    '</section>',
  ].join('');
}

function chartHtml(chart: ReportChart): string {
  const rows = chart.data
    .map(
      (datum) =>
        `<tr><td>${escapeHtml(datum.label)}</td><td class="count">${formatCount(datum.count)}</td></tr>`,
    )
    .join('');
  return [
    '<section>',
    `<h3>${escapeHtml(chart.property)}</h3>`,
    '<table><thead><tr><th>Value</th><th class="count">Count</th></tr></thead>',
    `<tbody>${rows}</tbody></table>`,
    '</section>',
  ].join('');
}

function metaText(content: ReportContent): string {
  const parts = [
    content.version,
    `${formatCount(content.elements)} elements`,
    content.models.length > 1 ? `${content.models.length} models` : null,
    dateText(content.date),
  ].filter((part): part is string => Boolean(part));
  return parts.join('  |  ');
}

export function reportHtml(content: ReportContent): string {
  const figure = content.image
    ? `<figure><img src="${escapeHtml(content.image)}" alt="Model snapshot"></figure>`
    : '';
  const summary = content.sections.map(sectionHtml).join('');
  const charts = content.charts.map(chartHtml).join('');
  const unavailable =
    content.unavailable.length > 0
      ? `<p class="more">Properties unavailable for ${escapeHtml(content.unavailable.join(', '))}.</p>`
      : '';
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(content.title)}</title>`,
    `<style>${REPORT_PRINT_STYLE}</style>`,
    '</head>',
    '<body>',
    '<header>',
    `<h1>${escapeHtml(content.title)}</h1>`,
    `<p class="meta">${escapeHtml(metaText(content))}</p>`,
    '</header>',
    figure,
    unavailable,
    summary ? `<h2>Summary</h2>${summary}` : '',
    charts ? `<h2>Dashboard</h2>${charts}` : '',
    '</body>',
    '</html>',
  ].join('');
}

export const REPORT_WAITING_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<title>Preparing report</title></head><body style="font:13px system-ui,sans-serif;padding:24px">' +
  'Preparing the report...</body></html>';

export function openReportWindow(): Window | null {
  const win = window.open('', '_blank', 'width=1024,height=900');
  if (!win) return null;
  writeDocument(win, REPORT_WAITING_HTML);
  return win;
}

function writeDocument(win: Window, html: string): void {
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function printWhenReady(win: Window): void {
  if (win.document.readyState === 'complete') {
    win.print();
    return;
  }
  win.addEventListener('load', () => win.print(), { once: true });
}

export function printReport(
  html: string,
  open: () => Window | null = openReportWindow,
): boolean {
  const win = open();
  if (!win) return false;
  writeDocument(win, html);
  printWhenReady(win);
  return true;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Could not read the snapshot'));
    reader.readAsDataURL(blob);
  });
}
