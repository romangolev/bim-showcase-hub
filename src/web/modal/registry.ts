import { DASHBOARD_SETTINGS_MODAL } from '../panels/DashboardSettings.js';
import { SUMMARY_SETTINGS_MODAL } from '../panels/SummarySettings.js';
import { SETTINGS_MODAL } from '../settings/SettingsModal.js';
import type { ModalDefinition } from './types.js';

export const MODALS: readonly ModalDefinition[] = [
  SETTINGS_MODAL,
  SUMMARY_SETTINGS_MODAL,
  DASHBOARD_SETTINGS_MODAL,
];
