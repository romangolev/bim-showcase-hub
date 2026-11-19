import { decodeBase64Url } from '../../shared/urn.js';
import type { ModelDbId } from '../viewer/modelSet.js';

export interface ViewCamera {
  eye: readonly [number, number, number];
  target: readonly [number, number, number];
  up: readonly [number, number, number];
  ortho: boolean;
}

export interface ViewPanes {
  open: string[];
  collapsed: string[];
}

export interface ViewChart {
  id: string;
  view: unknown;
}

export interface ViewLink {
  camera: ViewCamera;
  selection: ModelDbId[];
  panes?: ViewPanes;
  charts?: ViewChart[];
}

export const VIEW_VERSION = '1';
export const VIEW_FULL_VERSION = '2';
export const VIEW_SELECTION_CAP = 200;
export const MAX_VIEW_CHARS = 4000;
export const MAX_LINK_PANES = 12;
export const MAX_LINK_CHARTS = 4;

const SEPARATOR = '~';
const MAX_COORDINATE = 1e7;
const PANE_ID = /^[A-Za-z]+(?::[A-Za-z0-9]{1,8})?$/;
const CHART_ID = /^(?:dashboard|chart:[A-Za-z0-9]{1,8})$/;

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function vec(values: readonly number[]): string {
  return values.map((value) => round(value)).join(',');
}

function parseVec(raw: string | undefined): [number, number, number] | null {
  const parts = (raw ?? '').split(',');
  if (parts.length !== 3) return null;
  const numbers = parts.map((part) =>
    part === '' ? Number.NaN : Number(part),
  );
  if (
    !numbers.every((n) => Number.isFinite(n) && Math.abs(n) <= MAX_COORDINATE)
  ) {
    return null;
  }
  return numbers as [number, number, number];
}

function encodeSelection(
  selection: readonly ModelDbId[],
  modelIds: readonly string[],
): string {
  const byModel = new Map<number, number[]>();
  let count = 0;
  for (const { modelId, dbId } of selection) {
    const index = modelIds.indexOf(modelId);
    if (index === -1 || count >= VIEW_SELECTION_CAP) continue;
    count += 1;
    const ids = byModel.get(index);
    if (ids) ids.push(dbId);
    else byModel.set(index, [dbId]);
  }
  return [...byModel]
    .map(([index, ids]) => `${index}:${ids.join(',')}`)
    .join(';');
}

function decodeSelection(
  raw: string,
  modelIds: readonly string[],
): ModelDbId[] {
  const items: ModelDbId[] = [];
  for (const group of raw ? raw.split(';') : []) {
    const [indexRaw, idsRaw = ''] = group.split(':');
    if (!/^\d+$/.test(indexRaw ?? '')) continue;
    const modelId = modelIds[Number(indexRaw)];
    if (modelId === undefined) continue;
    for (const part of idsRaw.split(',')) {
      const dbId = Number(part);
      if (part !== '' && Number.isInteger(dbId) && dbId >= 0) {
        items.push({ modelId, dbId });
      }
    }
  }
  return items.slice(0, VIEW_SELECTION_CAP);
}

function validPaneIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((id): id is string => typeof id === 'string' && PANE_ID.test(id))
    .slice(0, MAX_LINK_PANES);
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(value: string): string | null {
  const binary = decodeBase64Url(value);
  if (binary === null) return null;
  try {
    return new TextDecoder().decode(
      Uint8Array.from(binary, (char) => char.charCodeAt(0)),
    );
  } catch {
    return null;
  }
}

function encodePanes(panes: ViewPanes | undefined): string | null {
  if (!panes) return null;
  const open = validPaneIds(panes.open);
  const collapsed = validPaneIds(panes.collapsed);
  if (open.length === 0 && collapsed.length === 0) return null;
  return `${open.join(',')}|${collapsed.join(',')}`;
}

function decodePanes(raw: string | undefined): ViewPanes | null {
  if (!raw) return null;
  const [open = '', collapsed = ''] = raw.split('|');
  const panes = {
    open: validPaneIds(open ? open.split(',') : []),
    collapsed: validPaneIds(collapsed ? collapsed.split(',') : []),
  };
  return panes.open.length === 0 && panes.collapsed.length === 0 ? null : panes;
}

function encodeCharts(charts: readonly ViewChart[] | undefined): string | null {
  if (!charts || charts.length === 0) return null;
  const kept = charts
    .filter((chart) => typeof chart.id === 'string' && CHART_ID.test(chart.id))
    .slice(0, MAX_LINK_CHARTS)
    .map(({ id, view }) => ({ id, view }));
  return kept.length === 0 ? null : toBase64Url(JSON.stringify(kept));
}

function decodeCharts(raw: string | undefined): ViewChart[] | null {
  if (!raw) return null;
  const text = fromBase64Url(raw);
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const charts: ViewChart[] = [];
  for (const entry of parsed) {
    if (charts.length >= MAX_LINK_CHARTS) break;
    if (typeof entry !== 'object' || entry === null) continue;
    const { id, view } = entry as { id?: unknown; view?: unknown };
    if (typeof id !== 'string' || !CHART_ID.test(id)) continue;
    if (typeof view !== 'object' || view === null) continue;
    charts.push({ id, view });
  }
  return charts.length === 0 ? null : charts;
}

export function encodeView(
  link: ViewLink,
  modelIds: readonly string[],
): string {
  const head = [
    vec(link.camera.eye),
    vec(link.camera.target),
    vec(link.camera.up),
    link.camera.ortho ? 'o' : 'p',
    encodeSelection(link.selection, modelIds),
  ];
  const panes = encodePanes(link.panes);
  const charts = encodeCharts(link.charts);
  if (panes === null && charts === null) {
    return [VIEW_VERSION, ...head].join(SEPARATOR);
  }
  return [VIEW_FULL_VERSION, ...head, panes ?? '', charts ?? ''].join(
    SEPARATOR,
  );
}

export interface FittedView {
  view: string;
  degraded: boolean;
}

export function fitView(
  link: ViewLink,
  modelIds: readonly string[],
): FittedView {
  const view = encodeView(link, modelIds);
  if (view.length <= MAX_VIEW_CHARS) return { view, degraded: false };
  return {
    view: encodeView(
      { camera: link.camera, selection: link.selection },
      modelIds,
    ),
    degraded: true,
  };
}

export function parseView(
  raw: unknown,
  modelIds: readonly string[],
): ViewLink | null {
  if (typeof raw !== 'string' || raw.length > MAX_VIEW_CHARS) return null;
  const [version, eye, target, up, projection, selection = '', panes, charts] =
    raw.split(SEPARATOR);
  if (version !== VIEW_VERSION && version !== VIEW_FULL_VERSION) return null;
  const camera = [parseVec(eye), parseVec(target), parseVec(up)];
  if (camera.some((entry) => entry === null)) return null;
  const [eyeVec, targetVec, upVec] = camera as [number, number, number][];
  if (eyeVec?.every((value, i) => value === targetVec?.[i])) return null;
  if (upVec?.every((value) => value === 0)) return null;
  if (projection !== 'o' && projection !== 'p') return null;
  const link: ViewLink = {
    camera: {
      eye: camera[0] as [number, number, number],
      target: camera[1] as [number, number, number],
      up: camera[2] as [number, number, number],
      ortho: projection === 'o',
    },
    selection: decodeSelection(selection, modelIds),
  };
  if (version === VIEW_FULL_VERSION) {
    const parsedPanes = decodePanes(panes);
    if (parsedPanes) link.panes = parsedPanes;
    const parsedCharts = decodeCharts(charts);
    if (parsedCharts) link.charts = parsedCharts;
  }
  return link;
}

export function withViewParam(href: string, view: string | null): string {
  const url = new URL(href);
  url.searchParams.delete('view');
  if (view) url.searchParams.set('view', view);
  return url.toString();
}
