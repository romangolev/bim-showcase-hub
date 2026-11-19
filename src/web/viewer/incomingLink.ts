import { useEffect, useRef } from 'react';
import {
  parseView,
  type ViewChart,
  type ViewLink,
  type ViewPanes,
} from '../api/viewLink.js';
import { sanitizeDashboardView } from '../extensions/dashboardPresets.js';
import { chartSetting } from '../layout/instanceSettings.js';
import type { LayoutApi } from '../layout/layoutContext.js';
import { isPaneId, type PaneId, paneById } from '../layout/paneRegistry.js';
import { PANE_SETTINGS } from '../settings/paneSettings.js';
import type { ModelInfo } from './modelSet.js';
import { COLLAPSED_PANES } from './shareLink.js';
import type { ViewerAdapter, ViewerState } from './ViewerAdapter.js';

export const LINK_RESTORED_TEXT =
  'Restored the panes and charts from the link; the summary columns stay local';

export type IncomingAdapter = Pick<
  ViewerAdapter,
  'setCamera' | 'selectModelIds' | 'restoreState'
>;

interface LinkApplyReport {
  panes: boolean;
  charts: number;
}

export function linkViewerState(
  link: ViewLink,
  modelIds: readonly string[],
): ViewerState | null {
  if (!link.nodes || link.nodes.length === 0) return null;
  const models: ViewerState['models'] = {};
  for (const modelId of modelIds) {
    const entry = link.nodes.find((nodes) => nodes.modelId === modelId);
    models[modelId] = {
      hidden: entry ? [...entry.hidden] : [],
      isolated: entry ? [...entry.isolated] : [],
      selection: link.selection
        .filter((item) => item.modelId === modelId)
        .map((item) => item.dbId),
    };
  }
  return { version: 1, camera: link.camera, cutplanes: [], models };
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

export function applyViewLink(
  link: ViewLink,
  layout: LayoutApi | null,
): LinkApplyReport {
  return {
    panes: applyPanes(link.panes, layout),
    charts: applyCharts(link.charts, layout),
  };
}

interface Pending {
  link: ViewLink;
  modelIds: readonly string[];
  state: ViewerState | null;
}

interface IncomingLink {
  offer: (
    raw: string | null,
    modelIds: readonly string[],
    layout: LayoutApi | null,
    clear: () => void,
    onResult: (text: string, error: boolean) => void,
  ) => void;
  settle: (adapter: IncomingAdapter, loaded: readonly ModelInfo[]) => void;
}

export function createIncomingLink(): IncomingLink {
  let handled: string | null = null;
  let pending: Pending | null = null;
  return {
    offer: (raw, modelIds, layout, clear, onResult) => {
      if (!raw) {
        handled = null;
        return;
      }
      if (raw === handled) return;
      handled = raw;
      clear();
      const link = parseView(raw, modelIds);
      if (!link) return;
      const report = applyViewLink(link, layout);
      pending = { link, modelIds, state: linkViewerState(link, modelIds) };
      if (report.panes || report.charts > 0)
        onResult(LINK_RESTORED_TEXT, false);
    },
    settle: (adapter, loaded) => {
      if (!pending) return;
      const expected = loaded.filter((model) =>
        pending?.modelIds.includes(model.id),
      );
      if (loaded.some((model) => model.status === 'loading')) return;
      if (!expected.some((model) => model.status === 'ready')) return;
      const { link, state } = pending;
      pending = null;
      adapter.setCamera(link.camera);
      if (link.selection.length > 0) adapter.selectModelIds(link.selection);
      if (state) void adapter.restoreState(state);
    },
  };
}

interface UseIncomingLinkOptions {
  adapter: IncomingAdapter | null;
  loaded: readonly ModelInfo[];
  raw: string | null;
  modelIds: readonly string[];
  layout: LayoutApi | null;
  clear?: () => void;
  onResult: (text: string, error: boolean) => void;
}

export function useIncomingLink({
  adapter,
  loaded,
  raw,
  modelIds,
  layout,
  clear,
  onResult,
}: UseIncomingLinkOptions): void {
  const link = useRef<IncomingLink>(null as unknown as IncomingLink);
  link.current ??= createIncomingLink();
  const latest = useRef({ clear, onResult });
  latest.current = { clear, onResult };
  const idsKey = modelIds.join('\n');
  useEffect(() => {
    if (!adapter) return;
    link.current.offer(
      raw,
      idsKey.split('\n'),
      layout,
      () => latest.current.clear?.(),
      (text, error) => latest.current.onResult(text, error),
    );
  }, [adapter, raw, idsKey, layout]);
  useEffect(() => {
    if (adapter) link.current.settle(adapter, loaded);
  }, [adapter, loaded, raw, idsKey]);
}
