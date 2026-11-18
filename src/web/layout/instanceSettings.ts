import {
  type DashboardView,
  DEFAULT_DASHBOARD_VIEW,
  sanitizeDashboardView,
} from '../extensions/dashboardPresets.js';
import { removeJson } from '../storage.js';
import {
  type PersistedSetting,
  persistedSetting,
} from '../tools/kernel/persistedSetting.js';
import { type PanelId, parsePanelId } from './paneRegistry.js';

export interface SummarySpec {
  scope: string;
}

const cache = new Map<string, PersistedSetting<unknown>>();

export function instanceSettingKey(id: PanelId): string {
  return `bsh.pane.${id.replace(':', '.')}.v1`;
}

function instanceSetting<T>(
  id: PanelId,
  initial: T,
  sanitize: (raw: unknown) => T,
): PersistedSetting<T> {
  const key = instanceSettingKey(id);
  const hit = cache.get(key);
  if (hit) return hit as PersistedSetting<T>;
  const created = persistedSetting(key, initial, sanitize);
  cache.set(key, created);
  return created;
}

export function chartSetting(id: PanelId): PersistedSetting<DashboardView> {
  return instanceSetting(id, { ...DEFAULT_DASHBOARD_VIEW }, (raw) => ({
    ...sanitizeDashboardView(raw),
    preset: null,
  }));
}

export function sanitizeSummarySpec(raw: unknown): SummarySpec {
  const scope = (raw as { scope?: unknown } | null)?.scope;
  return { scope: typeof scope === 'string' && scope ? scope : 'all' };
}

export function summarySetting(id: PanelId): PersistedSetting<SummarySpec> {
  return instanceSetting(id, { scope: 'all' }, sanitizeSummarySpec);
}

export function forgetInstanceSetting(id: PanelId): void {
  if (!parsePanelId(id)?.instance) return;
  const key = instanceSettingKey(id);
  cache.delete(key);
  removeJson(key);
}
