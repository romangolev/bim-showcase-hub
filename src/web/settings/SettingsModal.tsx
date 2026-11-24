import './sections.js';
import { translateNow } from '../i18n/i18n.js';
import type { ModalDefinition } from '../modal/types.js';
import { SettingsShell } from './SettingsShell.js';

export { SettingsShell as SettingsBody } from './SettingsShell.js';
export * from './settingsSections.js';

export const SETTINGS_MODAL: ModalDefinition = {
  id: 'settings',
  get title() {
    return translateNow('settings.title');
  },
  size: 'xl',
  Body: SettingsShell,
};
