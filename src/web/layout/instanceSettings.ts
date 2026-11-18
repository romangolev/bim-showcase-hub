import {
  type DashboardView,
  DEFAULT_DASHBOARD_VIEW,
  sanitizeDashboardView,
} from '../extensions/dashboardPresets.js';
import {
  DEFAULT_SUMMARY_PROPERTIES,
  sanitizeProperties,
} from '../extensions/modelSummary.js';
import { defineRecordFamily, type PersistedRecord } from '../storage.js';
import {
  type ElementScope,
  sanitizeElementScope,
} from '../viewer/propertyScope.js';
import { type PanelId, parsePanelId } from './paneRegistry.js';

export interface SummarySpec {
  scope: string;
  elements: ElementScope;
  properties: readonly string[];
}

const DEFAULT_SUMMARY_SPEC: SummarySpec = {
  scope: 'all',
  elements: 'all',
  properties: DEFAULT_SUMMARY_PROPERTIES,
};

const INSTANCE_PREFIX = 'bsh.pane.';

export function instanceSettingKey(id: PanelId): string {
  return `${INSTANCE_PREFIX}${id.replace(':', '.')}.v1`;
}

const charts = defineRecordFamily<DashboardView, PanelId>({
  prefix: INSTANCE_PREFIX,
  keyOf: instanceSettingKey,
  initial: { ...DEFAULT_DASHBOARD_VIEW },
  sanitize: (raw) => ({ ...sanitizeDashboardView(raw), preset: null }),
});

export function sanitizeSummarySpec(raw: unknown): SummarySpec {
  const spec = raw as Partial<Record<keyof SummarySpec, unknown>> | null;
  return {
    scope: typeof spec?.scope === 'string' && spec.scope ? spec.scope : 'all',
    elements: sanitizeElementScope(spec?.elements),
    properties: sanitizeProperties(spec?.properties),
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

export function chartSetting(id: PanelId): PersistedRecord<DashboardView> {
  return charts.get(id);
}

export function summarySetting(id: PanelId): PersistedRecord<SummarySpec> {
  return summaries.get(id);
}

export function forgetInstanceSetting(id: PanelId): void {
  if (!parsePanelId(id)?.instance) return;
  charts.forget(id);
  summaries.forget(id);
  propertyPanes.forget(id);
}

export function seedInstanceSetting(
  id: PanelId,
  activeModel: string | null,
): void {
  if (parsePanelId(id)?.kind === 'modelSummary' && activeModel) {
    summaries.get(id).write({ ...DEFAULT_SUMMARY_SPEC, scope: activeModel });
  }
  if (parsePanelId(id)?.kind === 'properties' && activeModel) {
    propertyPanes.get(id).write({ scope: activeModel });
  }
}
