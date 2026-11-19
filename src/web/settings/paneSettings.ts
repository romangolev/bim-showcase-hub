import {
  DEFAULT_TREE_VIEW,
  sanitizeTreeView,
  type TreeView,
} from '../components/tree/treeView.js';
import { DEFAULT_DASHBOARD_PROPERTIES } from '../extensions/dashboardData.js';
import {
  type DashboardView,
  DEFAULT_DASHBOARD_VIEW,
  sanitizeStoredDashboardView,
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

export const LEGACY_DASHBOARD_PROPERTIES = setting<readonly string[]>(
  BSH_KEYS.personal.dashboardProperties,
  DEFAULT_DASHBOARD_PROPERTIES,
  (raw) => sanitizePropertyNames(raw, DEFAULT_DASHBOARD_PROPERTIES),
);

export function withLegacyDashboardProperties(
  record: PersistedRecord<DashboardView>,
): PersistedRecord<DashboardView> {
  return {
    ...record,
    read: () =>
      record.has()
        ? record.read()
        : {
            ...record.initial,
            properties: LEGACY_DASHBOARD_PROPERTIES.read(),
          },
  };
}

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
      (raw) => sanitizePropertyNames(raw, DEFAULT_SUMMARY_PROPERTIES),
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
    view: withLegacyDashboardProperties(
      setting<DashboardView>(
        BSH_KEYS.personal.dashboardView,
        DEFAULT_DASHBOARD_VIEW,
        (raw) =>
          sanitizeStoredDashboardView(raw, LEGACY_DASHBOARD_PROPERTIES.read()),
      ),
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
