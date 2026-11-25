import {
  fitView,
  MAX_LINK_CHARTS,
  type ViewChart,
  type ViewLink,
  type ViewNodes,
  type ViewPanes,
} from '../api/viewLink.js';
import { withControls } from '../extensions/dashboardPresets.js';
import { chartInstanceIds, chartSetting } from '../layout/instanceSettings.js';
import type { LayoutApi } from '../layout/layoutContext.js';
import type { PaneId } from '../layout/paneRegistry.js';
import { PANE_SETTINGS } from '../settings/paneSettings.js';
import type { ViewerAdapter, ViewerState } from './ViewerAdapter.js';

export const LINK_DEGRADED_TEXT =
  'Link copied with the camera and selection only: the full view was too long';
export const LINK_TRIMMED_TEXT =
  'Link copied without the chart panes beyond the first three';

export const COLLAPSED_PANES: readonly PaneId[] = [
  'tree',
  'summary',
  'dashboard',
  'models',
];
export function captureCharts(): ViewChart[] {
  const charts: ViewChart[] = [
    {
      id: 'dashboard',
      view: withControls(PANE_SETTINGS.dashboard.view.read(), undefined),
    },
  ];
  for (const id of chartInstanceIds()) {
    const { action: _action, ...view } = chartSetting(id).read();
    charts.push({ id, view: withControls(view, undefined) });
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

interface SharedView {
  view: string;
  degraded: boolean;
  trimmed: boolean;
  link: ViewLink;
}

function captureNodes(
  state: ViewerState,
  modelIds: readonly string[],
): ViewNodes[] | undefined {
  const nodes: ViewNodes[] = [];
  for (const modelId of modelIds) {
    const entry = state.models[modelId];
    if (!entry) continue;
    if (entry.hidden.length === 0 && entry.isolated.length === 0) continue;
    nodes.push({
      modelId,
      hidden: [...entry.hidden],
      isolated: [...entry.isolated],
    });
  }
  return nodes.length === 0 ? undefined : nodes;
}

export interface ShareInclude {
  selection: boolean;
  panes: boolean;
  nodes: boolean;
}

export const SHARE_INCLUDE_ALL: ShareInclude = {
  selection: true,
  panes: true,
  nodes: true,
};

export function sharedView(
  adapter: ViewerAdapter,
  modelIds: readonly string[],
  layout: Pick<LayoutApi, 'openPanes' | 'isCollapsed'> | null,
  include: ShareInclude = SHARE_INCLUDE_ALL,
): SharedView | null {
  const camera = adapter.getCamera();
  if (!camera) return null;
  const panes = include.panes ? capturePanes(layout) : undefined;
  const nodes = include.nodes
    ? captureNodes(adapter.getState(), modelIds)
    : undefined;
  const link: ViewLink = {
    camera,
    selection: include.selection ? adapter.getModelSelection() : [],
    ...(panes ? { panes } : {}),
    ...(include.panes ? { charts: captureCharts() } : {}),
    ...(nodes ? { nodes } : {}),
  };
  return {
    ...fitView(link, modelIds),
    trimmed: include.panes && chartInstanceIds().length + 1 > MAX_LINK_CHARTS,
    link,
  };
}
