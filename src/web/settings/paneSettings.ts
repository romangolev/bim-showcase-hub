import {
  DEFAULT_TREE_VIEW,
  sanitizeTreeView,
  type TreeView,
} from '../components/tree/treeView.js';
import {
  type DashboardView,
  DEFAULT_DASHBOARD_VIEW,
  sanitizeDashboardView,
} from '../extensions/dashboardPresets.js';
import {
  type ElementAction,
  sanitizeAction,
} from '../extensions/elementActions.js';
import {
  DEFAULT_SUMMARY_VIEW,
  type SummaryView,
  sanitizeView,
} from '../extensions/modelSummary.js';
import { BSH_KEYS } from '../storage.js';
import { usePersistedState } from '../usePersistedState.js';

export interface PaneSetting<T> {
  key: string;
  initial: T;
  sanitize: (raw: unknown) => T;
}

function setting<T>(
  key: string,
  initial: T,
  sanitize: (raw: unknown) => T,
): PaneSetting<T> {
  return { key, initial, sanitize };
}

export const PANE_SETTINGS = {
  summary: {
    view: setting<SummaryView>(
      BSH_KEYS.personal.summaryView,
      DEFAULT_SUMMARY_VIEW,
      sanitizeView,
    ),
    action: setting<ElementAction>(
      BSH_KEYS.personal.summaryAction,
      'select',
      sanitizeAction,
    ),
  },
  dashboard: {
    view: setting<DashboardView>(
      BSH_KEYS.personal.dashboardView,
      DEFAULT_DASHBOARD_VIEW,
      sanitizeDashboardView,
    ),
    action: setting<ElementAction>(
      BSH_KEYS.personal.dashboardAction,
      'select',
      sanitizeAction,
    ),
  },
  tree: {
    view: setting<TreeView>(
      BSH_KEYS.preference.treeView,
      DEFAULT_TREE_VIEW,
      sanitizeTreeView,
    ),
  },
} as const;

export function usePaneSetting<T>(spec: PaneSetting<T>) {
  return usePersistedState<T>(spec.key, spec.initial, spec.sanitize);
}
