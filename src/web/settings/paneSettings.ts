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
  DEFAULT_SUMMARY_PROPERTIES,
  DEFAULT_SUMMARY_VIEW,
  type SummaryView,
  sanitizeView,
} from '../extensions/modelSummary.js';
import { sanitizePropertyNames } from '../extensions/propertyNames.js';
import { BSH_KEYS, defineRecord } from '../storage.js';

export const PANE_SETTINGS = {
  summary: {
    view: defineRecord<SummaryView>({
      key: BSH_KEYS.personal.summaryView,
      initial: DEFAULT_SUMMARY_VIEW,
      sanitize: sanitizeView,
    }),
    properties: defineRecord<readonly string[]>({
      key: BSH_KEYS.personal.summaryProperties,
      initial: DEFAULT_SUMMARY_PROPERTIES,
      sanitize: (raw) => sanitizePropertyNames(raw, DEFAULT_SUMMARY_PROPERTIES),
    }),
    action: defineRecord<ElementAction>({
      key: BSH_KEYS.personal.summaryAction,
      initial: 'select',
      sanitize: sanitizeAction,
    }),
  },
  dashboard: {
    view: defineRecord<DashboardView>({
      key: BSH_KEYS.personal.dashboardView,
      initial: DEFAULT_DASHBOARD_VIEW,
      sanitize: sanitizeDashboardView,
    }),
    action: defineRecord<ElementAction>({
      key: BSH_KEYS.personal.dashboardAction,
      initial: 'select',
      sanitize: sanitizeAction,
    }),
  },
  tree: {
    view: defineRecord<TreeView>({
      key: BSH_KEYS.preference.treeView,
      initial: DEFAULT_TREE_VIEW,
      sanitize: sanitizeTreeView,
    }),
  },
} as const;
