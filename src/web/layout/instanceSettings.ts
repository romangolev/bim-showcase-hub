import { useMemo } from 'react';
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
import { PANE_SETTINGS } from '../settings/paneSettings.js';
import {
  BSH_PREFIXES,
  defineRecordFamily,
  getStorageAdapter,
  type PersistedRecord,
  usePersisted,
} from '../storage.js';
import { ALL_MODELS } from '../viewer/modelScope.js';
import { type PanelId, parsePanelId } from './paneRegistry.js';
import { dropPaneSettingsTarget } from './settingsTarget.js';

export interface SummarySpec {
  scope: string;
  properties: readonly string[];
  view: SummaryView;
  action: ElementAction;
}

const DEFAULT_SUMMARY_SPEC: SummarySpec = {
  scope: 'all',
  properties: DEFAULT_SUMMARY_PROPERTIES,
  view: DEFAULT_SUMMARY_VIEW,
  action: 'select',
};

const INSTANCE_PREFIX = BSH_PREFIXES.pane;

export function instanceSettingKey(id: PanelId): string {
  return `${INSTANCE_PREFIX}${id.replace(':', '.')}.v1`;
}

export type DashboardSpec = DashboardView & { action?: ElementAction };

export function sanitizeDashboardSpec(raw: unknown): DashboardSpec {
  const action = (raw as { action?: unknown } | null)?.action;
  return {
    ...sanitizeDashboardView(raw),
    ...(action === undefined ? {} : { action: sanitizeAction(action) }),
  };
}

const charts = defineRecordFamily<DashboardSpec, PanelId>({
  prefix: INSTANCE_PREFIX,
  keyOf: instanceSettingKey,
  initial: { ...DEFAULT_DASHBOARD_VIEW },
  sanitize: sanitizeDashboardSpec,
});

export function sanitizeSummarySpec(raw: unknown): SummarySpec {
  const spec = raw as Partial<Record<keyof SummarySpec, unknown>> | null;
  return {
    scope: typeof spec?.scope === 'string' && spec.scope ? spec.scope : 'all',
    properties: sanitizePropertyNames(
      spec?.properties,
      DEFAULT_SUMMARY_PROPERTIES,
    ),
    view: sanitizeView(spec?.view),
    action: sanitizeAction(spec?.action),
  };
}

const summaries = defineRecordFamily<SummarySpec, PanelId>({
  prefix: INSTANCE_PREFIX,
  keyOf: instanceSettingKey,
  initial: DEFAULT_SUMMARY_SPEC,
  sanitize: sanitizeSummarySpec,
});

export interface PropertiesSpec {
  scope: string;
}

const DEFAULT_PROPERTIES_SPEC: PropertiesSpec = { scope: 'all' };

export function sanitizePropertiesSpec(raw: unknown): PropertiesSpec {
  const scope = (raw as Partial<PropertiesSpec> | null)?.scope;
  return { scope: typeof scope === 'string' && scope ? scope : 'all' };
}

const propertyPanes = defineRecordFamily<PropertiesSpec, PanelId>({
  prefix: INSTANCE_PREFIX,
  keyOf: instanceSettingKey,
  initial: DEFAULT_PROPERTIES_SPEC,
  sanitize: sanitizePropertiesSpec,
});

export function propertiesSetting(
  id: PanelId,
): PersistedRecord<PropertiesSpec> {
  return propertyPanes.get(id);
}

const SUMMARY = PANE_SETTINGS.summary;
const DASHBOARD = PANE_SETTINGS.dashboard;

const mainSummary: PersistedRecord<SummarySpec> = {
  key: 'main:summary',
  initial: DEFAULT_SUMMARY_SPEC,
  sanitize: sanitizeSummarySpec,
  watch: [SUMMARY.view.key, SUMMARY.properties.key, SUMMARY.action.key],
  read: () => ({
    ...DEFAULT_SUMMARY_SPEC,
    properties: SUMMARY.properties.read(),
    view: SUMMARY.view.read(),
    action: SUMMARY.action.read(),
  }),
  has: () => SUMMARY.view.has() || SUMMARY.properties.has(),
  write: (spec) =>
    [
      SUMMARY.properties.write(spec.properties),
      SUMMARY.view.write(spec.view),
      SUMMARY.action.write(spec.action),
    ].every(Boolean),
  remove: () => {
    SUMMARY.view.remove();
    SUMMARY.properties.remove();
    SUMMARY.action.remove();
  },
};

const mainDashboard: PersistedRecord<DashboardSpec> = {
  key: 'main:dashboard',
  initial: { ...DEFAULT_DASHBOARD_VIEW },
  sanitize: sanitizeDashboardSpec,
  watch: [DASHBOARD.view.key, DASHBOARD.action.key],
  read: () => ({ ...DASHBOARD.view.read(), action: DASHBOARD.action.read() }),
  has: () => DASHBOARD.view.has() || DASHBOARD.action.has(),
  write: ({ action, ...view }) =>
    [
      DASHBOARD.view.write(view),
      action === undefined || DASHBOARD.action.write(action),
    ].every(Boolean),
  remove: () => {
    DASHBOARD.view.remove();
    DASHBOARD.action.remove();
  },
};

export const SUMMARY_PANEL: PanelId = 'summary';
export const DASHBOARD_PANEL: PanelId = 'dashboard';

export function summarySetting(id: PanelId): PersistedRecord<SummarySpec> {
  return id === SUMMARY_PANEL ? mainSummary : summaries.get(id);
}

export function chartSetting(id: PanelId): PersistedRecord<DashboardSpec> {
  return id === DASHBOARD_PANEL ? mainDashboard : charts.get(id);
}

export function chartInstanceIds(): PanelId[] {
  const prefix = `${INSTANCE_PREFIX}chart.`;
  const ids: PanelId[] = [];
  for (const key of getStorageAdapter().keys('local')) {
    if (!key.startsWith(prefix) || !key.endsWith('.v1')) continue;
    const instance = key.slice(prefix.length, -'.v1'.length);
    const id = `chart:${instance}`;
    if (instance && instanceSettingKey(id) === key) ids.push(id);
  }
  return ids.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function useSummarySpec(id: PanelId) {
  const [spec, setSpec, reset] = usePersisted(summarySetting(id));
  const scope =
    id === SUMMARY_PANEL
      ? undefined
      : {
          value: spec.scope,
          onChange: (next: string) =>
            setSpec((prev) => ({ ...prev, scope: next })),
        };
  return { spec, setSpec, reset, scope };
}

export function useDashboardSpec(id: PanelId) {
  const main = id === DASHBOARD_PANEL;
  const [spec, setSpec] = usePersisted(chartSetting(id));
  const [mainAction] = usePersisted(DASHBOARD.action);
  const override = spec.action;
  const view = useMemo(() => {
    const { action: _action, ...rest } = spec;
    return rest;
  }, [spec]);
  return {
    main,
    view,
    action: override ?? mainAction,
    setView: (next: DashboardView | ((prev: DashboardView) => DashboardView)) =>
      setSpec((prev) => {
        const { action, ...current } = prev;
        const value = typeof next === 'function' ? next(current) : next;
        return action === undefined ? value : { ...value, action };
      }),
    resetView: () =>
      setSpec((prev) => ({
        ...DEFAULT_DASHBOARD_VIEW,
        ...(prev.action === undefined ? {} : { action: prev.action }),
      })),
    setAction: (action: ElementAction) =>
      setSpec((prev) => ({ ...prev, action })),
    resetAction: () =>
      setSpec((prev) => {
        const { action: _dropped, ...rest } = prev;
        return main ? { ...rest, action: DASHBOARD.action.initial } : rest;
      }),
    scope: main
      ? undefined
      : {
          value: view.scope ?? ALL_MODELS,
          onChange: (next: string) =>
            setSpec((prev) => ({ ...prev, scope: next })),
        },
  };
}

export function forgetInstanceSetting(id: PanelId): void {
  if (!parsePanelId(id)?.instance) return;
  dropPaneSettingsTarget(id);
  charts.forget(id);
  summaries.forget(id);
  propertyPanes.forget(id);
}

export function seedInstanceSetting(
  id: PanelId,
  activeModel: string | null,
): void {
  if (parsePanelId(id)?.kind === 'modelSummary') {
    summaries.get(id).write({
      ...DEFAULT_SUMMARY_SPEC,
      scope: activeModel ?? 'all',
      view: PANE_SETTINGS.summary.view.read(),
      action: PANE_SETTINGS.summary.action.read(),
    });
  }
  if (parsePanelId(id)?.kind === 'properties' && activeModel) {
    propertyPanes.get(id).write({ scope: activeModel });
  }
}
