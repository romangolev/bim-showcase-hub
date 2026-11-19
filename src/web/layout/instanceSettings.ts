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
  LEGACY_DASHBOARD_PROPERTIES,
  PANE_SETTINGS,
  withLegacyDashboardProperties,
} from '../settings/paneSettings.js';
import {
  defineRecordFamily,
  getStorageAdapter,
  type PersistedRecord,
} from '../storage.js';
import {
  type ElementScope,
  sanitizeElementScope,
} from '../viewer/propertyScope.js';
import { dropDashboardSettingsTarget } from './dashboardTarget.js';
import { type PanelId, parsePanelId } from './paneRegistry.js';
import { dropSummarySettingsTarget } from './summaryTarget.js';

export interface SummarySpec {
  scope: string;
  elements: ElementScope;
  properties: readonly string[];
  view: SummaryView;
  action: ElementAction;
}

const DEFAULT_SUMMARY_SPEC: SummarySpec = {
  scope: 'all',
  elements: 'all',
  properties: DEFAULT_SUMMARY_PROPERTIES,
  view: DEFAULT_SUMMARY_VIEW,
  action: 'select',
};

const INSTANCE_PREFIX = 'bsh.pane.';

export function instanceSettingKey(id: PanelId): string {
  return `${INSTANCE_PREFIX}${id.replace(':', '.')}.v1`;
}

const charts = defineRecordFamily<DashboardView, PanelId>({
  prefix: INSTANCE_PREFIX,
  keyOf: instanceSettingKey,
  initial: { ...DEFAULT_DASHBOARD_VIEW },
  sanitize: (raw) => ({
    ...sanitizeStoredDashboardView(raw, LEGACY_DASHBOARD_PROPERTIES.read()),
    preset: null,
  }),
});

export function sanitizeSummarySpec(raw: unknown): SummarySpec {
  const spec = raw as Partial<Record<keyof SummarySpec, unknown>> | null;
  return {
    scope: typeof spec?.scope === 'string' && spec.scope ? spec.scope : 'all',
    elements: sanitizeElementScope(spec?.elements),
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

const chartRecords = new Map<PanelId, PersistedRecord<DashboardView>>();

export function chartSetting(id: PanelId): PersistedRecord<DashboardView> {
  let record = chartRecords.get(id);
  if (!record) {
    record = withLegacyDashboardProperties(charts.get(id));
    chartRecords.set(id, record);
  }
  return record;
}

export function summarySetting(id: PanelId): PersistedRecord<SummarySpec> {
  return summaries.get(id);
}

export function forgetInstanceSetting(id: PanelId): void {
  if (!parsePanelId(id)?.instance) return;
  dropSummarySettingsTarget(id);
  dropDashboardSettingsTarget(id);
  chartRecords.delete(id);
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

function lacksStoredProperties(key: string): boolean {
  const text = getStorageAdapter().get('local', key);
  if (text === null) return false;
  try {
    const raw = JSON.parse(text) as { properties?: unknown } | null;
    return !Array.isArray(raw?.properties) || raw.properties.length === 0;
  } catch {
    return false;
  }
}

export function migrateDashboardProperties(): void {
  const main = PANE_SETTINGS.dashboard.view;
  if (lacksStoredProperties(main.key)) main.write(main.read());
  for (const key of getStorageAdapter().keys('local')) {
    const instance = /^bsh\.pane\.chart\.(.+)\.v1$/.exec(key)?.[1];
    if (!instance) continue;
    const record = chartSetting(`chart:${instance}`);
    if (lacksStoredProperties(key)) record.write(record.read());
  }
}
