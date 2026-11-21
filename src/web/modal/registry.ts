import { HELP_SHORTCUTS_MODAL } from '../help/helpModal.js';
import { DASHBOARD_SETTINGS_MODAL } from '../panels/DashboardSettings.js';
import { SUMMARY_SETTINGS_MODAL } from '../panels/SummarySettings.js';
import { VIEWPOINTS_MODAL } from '../panels/Viewpoints.js';
import { SETTINGS_MODAL } from '../settings/SettingsModal.js';
import { TOOLS } from '../tools/index.js';
import type { ModalDefinition } from './types.js';

export const MODALS: readonly ModalDefinition[] = [
  SETTINGS_MODAL,
  HELP_SHORTCUTS_MODAL,
  SUMMARY_SETTINGS_MODAL,
  DASHBOARD_SETTINGS_MODAL,
  VIEWPOINTS_MODAL,
  ...TOOLS.modals(),
];
