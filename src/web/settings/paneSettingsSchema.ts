import type { ComponentType } from 'react';
import type { PaneId } from '../layout/paneRegistry.js';
import { setSummarySettingsTarget } from '../layout/summaryTarget.js';
import { DASHBOARD_SETTINGS_ID } from '../panels/DashboardSettings.js';
import { MODELS_SETTINGS_ID } from '../panels/ModelsSettings.js';
import { SUMMARY_SETTINGS_ID } from '../panels/SummarySettings.js';
import { TreeSettingsForm } from './PaneSettingsForms.js';

export interface PaneSettingsSchema {
  label: string;
  description: string;
  windowTitle: string;
  modalId?: string;
  Body?: ComponentType;
  onOpen?: () => void;
}

export const PANE_SETTINGS_SCHEMA: Partial<Record<PaneId, PaneSettingsSchema>> =
  {
    tree: {
      label: 'Documents',
      description: 'Sort order and the metadata shown in the tree.',
      windowTitle: 'Documents settings',
      Body: TreeSettingsForm,
    },
    summary: {
      label: 'Model summary',
      description: 'Columns, sorting, density and the row click action.',
      windowTitle: 'Summary settings',
      modalId: SUMMARY_SETTINGS_ID,
      onOpen: () => setSummarySettingsTarget(null),
    },
    dashboard: {
      label: 'Dashboard',
      description: 'Preset, chart type, categories and the chart click action.',
      windowTitle: 'Dashboard settings',
      modalId: DASHBOARD_SETTINGS_ID,
    },
    models: {
      label: 'Models',
      description: 'Save the open models as a model set.',
      windowTitle: 'Models settings',
      modalId: MODELS_SETTINGS_ID,
    },
  };

export const PANE_SETTINGS_ORDER: readonly PaneId[] = [
  'tree',
  'summary',
  'dashboard',
  'models',
];

export function paneSettingsSchema(kind: PaneId): PaneSettingsSchema | null {
  return PANE_SETTINGS_SCHEMA[kind] ?? null;
}
