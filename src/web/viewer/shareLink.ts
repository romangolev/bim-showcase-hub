import {
  fitView,
  MAX_LINK_CHARTS,
  parseView,
  type ViewChart,
  type ViewLink,
  type ViewPanes,
  withViewParam,
} from '../api/viewLink.js';
import {
  type DashboardView,
  sanitizeDashboardView,
} from '../extensions/dashboardPresets.js';
import { chartSetting } from '../layout/instanceSettings.js';
import type { LayoutApi } from '../layout/layoutContext.js';
import { isPaneId, type PaneId, paneById } from '../layout/paneRegistry.js';
import { PANE_SETTINGS } from '../settings/paneSettings.js';
import { getStorageAdapter } from '../storage.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

export const LINK_RESTORED_TEXT =
  'Restored the panes and charts from the link; the summary columns stay local';
export const LINK_DEGRADED_TEXT =
  'Link copied with the camera and selection only: the full view was too long';
export const LINK_TRIMMED_TEXT =
  'Link copied without the chart panes beyond the first three';

const COLLAPSED_PANES: readonly PaneId[] = [
  'tree',
  'summary',
  'dashboard',
  'models',
];
const CHART_INSTANCE_KEY = /^bsh\.pane\.chart\.(.+)\.v1$/;
const CHART_PANEL = /^chart:([A-Za-z0-9]{1,8})$/;

function portableView(view: DashboardView): DashboardView {
  if (typeof view.elements === 'string' && view.elements.startsWith('set:')) {
    const { elements: _set, ...rest } = view;
    return rest;
  }
  return view;
}

function chartInstanceIds(): string[] {
  const ids: string[] = [];
  for (const key of getStorageAdapter().keys('local')) {
    const instance = CHART_INSTANCE_KEY.exec(key)?.[1];
    if (instance) ids.push(`chart:${instance}`);
  }
  return ids.sort((a, b) =>
    (CHART_PANEL.exec(a)?.[1] ?? a).localeCompare(
      CHART_PANEL.exec(b)?.[1] ?? b,
      undefined,
      { numeric: true },
    ),
  );
}

export function captureCharts(): ViewChart[] {
  const charts: ViewChart[] = [
    {
      id: 'dashboard',
      view: portableView(PANE_SETTINGS.dashboard.view.read()),
    },
  ];
  for (const id of chartInstanceIds()) {
    charts.push({
      id,
      view: portableView(chartSetting(id as PaneId).read()),
    });
  }
  return charts.slice(0, MAX_LINK_CHARTS);
}

export function capturePanes(
  layout: Pick<LayoutApi, 'openPanes' | 'isCollapsed'> | null,
): ViewPanes | undefined {
  if (!layout) return undefined;
  const open = [...layout.openPanes];
  const collapsed = COLLAPSED_PANES.filter((id) => layout.isCollapsed(id));
  return open.length === 0 && collapsed.length === 0
    ? undefined
    : { open, collapsed };
}

export interface SharedView {
  view: string;
  degraded: boolean;
  trimmed: boolean;
}

export function sharedView(
  adapter: ViewerAdapter,
  modelIds: readonly string[],
  layout: Pick<LayoutApi, 'openPanes' | 'isCollapsed'> | null,
): SharedView | null {
  const camera = adapter.getCamera();
  if (!camera) return null;
  const panes = capturePanes(layout);
  return {
    ...fitView(
      {
        camera,
        selection: adapter.getModelSelection(),
        ...(panes ? { panes } : {}),
        charts: captureCharts(),
      },
      modelIds,
    ),
    trimmed: chartInstanceIds().length + 1 > MAX_LINK_CHARTS,
  };
}

export function linkViewFromUrl(search: string): string | null {
  const value = new URLSearchParams(search).get('view');
  return value && value.length > 0 ? value : null;
}

function isLinkPane(id: string): id is PaneId {
  return isPaneId(id) && (id === 'viewer' || paneById(id).component !== null);
}

function applyPanes(panes: ViewPanes | undefined, layout: LayoutApi | null) {
  if (!panes || !layout || layout.mode === 'stacked') return false;
  let changed = false;
  const open = new Set<PaneId>(panes.open.filter(isLinkPane));
  for (const id of open) {
    if (!layout.openPanes.includes(id)) {
      layout.togglePane(id);
      changed = true;
    }
  }
  const collapsed = new Set(
    COLLAPSED_PANES.filter((id) => panes.collapsed.includes(id)),
  );
  const candidates = new Set<PaneId>([...COLLAPSED_PANES, ...open]);
  for (const id of candidates) {
    const wanted = collapsed.has(id);
    if (layout.isCollapsed(id) !== wanted) {
      layout.setCollapsed(id, wanted);
      changed = true;
    }
  }
  return changed;
}

function applyCharts(
  charts: readonly ViewChart[] | undefined,
  layout: LayoutApi | null,
): number {
  if (!charts || charts.length === 0) return 0;
  let applied = 0;
  for (const chart of charts) {
    const view = sanitizeDashboardView(chart.view);
    if (chart.id === 'dashboard') {
      PANE_SETTINGS.dashboard.view.write(view);
      applied += 1;
      continue;
    }
    const created = layout?.addInstance('chart');
    if (!created) continue;
    chartSetting(created as PaneId).write(view);
    applied += 1;
  }
  return applied;
}

export interface LinkApplyReport {
  panes: boolean;
  charts: number;
}

export function applyViewLink(
  link: ViewLink,
  layout: LayoutApi | null,
): LinkApplyReport {
  return {
    panes: applyPanes(link.panes, layout),
    charts: applyCharts(link.charts, layout),
  };
}

const applied = new Set<string>();

export function resetAppliedLinks(): void {
  applied.clear();
}

export function clearLinkView(): void {
  window.history.replaceState(
    window.history.state,
    '',
    withViewParam(window.location.href, null),
  );
}

export function restoreLinkView(
  search: string,
  modelIds: readonly string[],
  layout: LayoutApi | null,
): LinkApplyReport | null {
  const raw = linkViewFromUrl(search);
  if (!raw || applied.has(raw)) return null;
  const link = parseView(raw, modelIds);
  if (!link) return null;
  applied.add(raw);
  return applyViewLink(link, layout);
}
