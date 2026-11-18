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
import { PANE_SETTINGS } from '../settings/paneSettings.js';
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
  sanitize: (raw) => ({ ...sanitizeDashboardView(raw), preset: null }),
});

export function sanitizeSummarySpec(raw: unknown): SummarySpec {
  const spec = raw as Partial<Record<keyof SummarySpec, unknown>> | null;
  return {
    scope: typeof spec?.scope === 'string' && spec.scope ? spec.scope : 'all',
    elements: sanitizeElementScope(spec?.elements),
    properties: sanitizeProperties(spec?.properties),
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
}
