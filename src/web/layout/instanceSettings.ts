import {
  type DashboardView,
  DEFAULT_DASHBOARD_VIEW,
  sanitizeDashboardView,
} from '../extensions/dashboardPresets.js';
import { defineRecordFamily, type PersistedRecord } from '../storage.js';
import { type PanelId, parsePanelId } from './paneRegistry.js';

export interface SummarySpec {
  scope: string;
}

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
  const scope = (raw as { scope?: unknown } | null)?.scope;
  return { scope: typeof scope === 'string' && scope ? scope : 'all' };
}

const summaries = defineRecordFamily<SummarySpec, PanelId>({
  prefix: INSTANCE_PREFIX,
  keyOf: instanceSettingKey,
  initial: { scope: 'all' },
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
  if (parsePanelId(id)?.kind === 'modelSummary' && activeModel) {
    summaries.get(id).write({ scope: activeModel });
  }
}
