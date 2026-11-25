import { useEffect, useState } from 'react';
import { isRecord } from '../../../shared/guards.js';
import type { FormDefinition } from '../../components/SettingsForm.js';
import { defineRecord } from '../../storage.js';
import { usePublishedAdapter } from '../../viewer/activeAdapterStore.js';
import { NATIVE_CONTROLS } from '../../viewer/nativeControls.js';
import type { ViewerAdapter } from '../../viewer/ViewerAdapter.js';
import { ToolForm } from '../kernel/ToolForm.js';
import {
  readEnabled,
  type ToolContribution,
  type ToolSettings,
  ViewerTool,
} from '../kernel/ViewerTool.js';
import { TOOLBAR_PROFILES, type ToolbarProfileId } from './nativeControls.js';

export const TOOLBAR_SETTINGS_KEY = 'bsh.tool.toolbar.v1';
export const MAX_HIDDEN_CONTROLS = 40;

export interface ToolbarSettings extends ToolSettings {
  profile: ToolbarProfileId;
  hidden: string[];
}

export const DEFAULT_TOOLBAR_SETTINGS: ToolbarSettings = {
  enabled: true,
  profile: 'full',
  hidden: [],
};

const PROFILE_LABELS: Record<ToolbarProfileId, string> = {
  full: 'Full',
  review: 'Review',
  present: 'Present',
  minimal: 'Minimal',
  custom: 'Custom',
};

function readProfile(raw: unknown): ToolbarProfileId {
  if (raw === 'custom') return 'custom';
  return typeof raw === 'string' && Object.hasOwn(TOOLBAR_PROFILES, raw)
    ? (raw as keyof typeof TOOLBAR_PROFILES)
    : 'full';
}

function readHidden(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const id = entry.trim();
    if (!id || ids.includes(id)) continue;
    ids.push(id);
    if (ids.length >= MAX_HIDDEN_CONTROLS) break;
  }
  return ids;
}

export function sanitizeToolbarSettings(raw: unknown): ToolbarSettings {
  const source = isRecord(raw) ? raw : {};
  return {
    enabled: readEnabled(source),
    profile: readProfile(source.profile),
    hidden: readHidden(source.hidden),
  };
}

export const TOOLBAR_SETTINGS = defineRecord<ToolbarSettings>({
  key: TOOLBAR_SETTINGS_KEY,
  initial: DEFAULT_TOOLBAR_SETTINGS,
  sanitize: sanitizeToolbarSettings,
});

export function hiddenFor(settings: ToolbarSettings): readonly string[] {
  return settings.profile === 'custom'
    ? settings.hidden
    : TOOLBAR_PROFILES[settings.profile];
}

export const TOOLBAR_FORM: FormDefinition<ToolbarSettings> = {
  title: 'Profile',
  intro:
    'Hides native viewer tools in this browser. The named profiles keep the orbit tool, so the model can always be moved.',
  fields: [
    {
      key: 'profile',
      kind: 'select',
      label: 'Profile',
      options: (Object.keys(TOOLBAR_PROFILES) as ToolbarProfileId[]).map(
        (id) => ({ value: id, label: PROFILE_LABELS[id] }),
      ),
      hint: 'Present hides section, measure, explode, the model browser, properties and settings. Minimal keeps only orbit and full screen. Review hides first person and the camera menu.',
    },
    {
      key: 'hidden',
      kind: 'multi',
      label: 'Hidden tools (custom)',
      options: NATIVE_CONTROLS.map((control) => ({
        value: control.id,
        label: control.label,
      })),
      hint: 'Used only when the profile is Custom.',
    },
  ],
};

const missingByAdapter = new WeakMap<ViewerAdapter, string[]>();
const missingListeners = new Set<() => void>();

function missingFor(adapter: ViewerAdapter | null): string[] {
  return adapter ? (missingByAdapter.get(adapter) ?? []) : [];
}

function recordMissing(adapter: ViewerAdapter, ids: string[]): void {
  missingByAdapter.set(adapter, ids);
  for (const listener of [...missingListeners]) listener();
}

function labelFor(id: string): string {
  return NATIVE_CONTROLS.find((control) => control.id === id)?.label ?? id;
}

function applyHidden(adapter: ViewerAdapter, settings: ToolbarSettings): void {
  recordMissing(adapter, adapter.setHiddenControls(hiddenFor(settings)));
}

export class ToolbarProfileTool extends ViewerTool<ToolbarSettings> {
  readonly id = 'toolbar';
  readonly title = 'Toolbar profile';
  readonly description =
    'Hide native viewer tools for review, presenting or a smaller toolbar.';
  readonly settings = TOOLBAR_SETTINGS;
  readonly form = TOOLBAR_FORM;

  contribute(): ToolContribution {
    return {};
  }

  override toolbarSignature(settings: ToolbarSettings): unknown {
    return [settings.enabled, hiddenFor(settings)];
  }

  override onSettingsChanged(
    adapter: ViewerAdapter,
    _previous: ToolbarSettings | undefined,
    next: ToolbarSettings,
  ): void {
    if (!next.enabled) return;
    applyHidden(adapter, next);
  }

  override onModelsReady(
    adapter: ViewerAdapter,
    settings: ToolbarSettings,
  ): void {
    if (!settings.enabled) return;
    applyHidden(adapter, settings);
  }

  override onDisabled(adapter: ViewerAdapter): void {
    recordMissing(adapter, adapter.setHiddenControls([]));
  }

  protected override renderFields() {
    return (
      <>
        <ToolForm tool={this} form={TOOLBAR_FORM} />
        <MissingControls />
      </>
    );
  }
}

function MissingControls() {
  const adapter = usePublishedAdapter();
  const [missing, setMissing] = useState(() => missingFor(adapter));
  useEffect(() => {
    const sync = () => setMissing(missingFor(adapter));
    sync();
    missingListeners.add(sync);
    return () => {
      missingListeners.delete(sync);
    };
  }, [adapter]);
  if (missing.length === 0) return null;
  return (
    <section className="settings__section" aria-label="Missing controls">
      <p className="settings__hint">
        Not in this viewer version: {missing.map(labelFor).join(', ')}
      </p>
    </section>
  );
}
