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
import {
  type PersistedSetting,
  persistedSetting,
  usePersistedSetting,
} from '../tools/kernel/persistedSetting.js';

export type PaneSetting<T> = PersistedSetting<T>;

const setting = persistedSetting;

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

export const usePaneSetting = usePersistedSetting;
