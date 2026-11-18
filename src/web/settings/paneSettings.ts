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
  sanitizeProperties,
  sanitizeView,
} from '../extensions/modelSummary.js';
import {
  BSH_KEYS,
  defineRecord,
  type PersistedRecord,
  usePersisted,
} from '../storage.js';
import type { ElementScope } from '../viewer/propertyScope.js';
import { sanitizeElementScope } from '../viewer/propertyScope.js';

export type PaneSetting<T> = PersistedRecord<T>;

const setting = <T>(
  key: string,
  initial: T,
  sanitize: (raw: unknown) => T,
): PersistedRecord<T> => defineRecord({ key, initial, sanitize });

export const PANE_SETTINGS = {
  summary: {
    view: setting<SummaryView>(
      BSH_KEYS.personal.summaryView,
      DEFAULT_SUMMARY_VIEW,
      sanitizeView,
    ),
    properties: setting<readonly string[]>(
      BSH_KEYS.personal.summaryProperties,
      DEFAULT_SUMMARY_PROPERTIES,
      sanitizeProperties,
    ),
    scope: setting<ElementScope>(
      BSH_KEYS.personal.summaryScope,
      'all',
      sanitizeElementScope,
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

export const usePaneSetting = usePersisted;
