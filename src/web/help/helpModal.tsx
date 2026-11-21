import { translateNow } from '../i18n/i18n.js';
import type { ModalDefinition } from '../modal/types.js';
import { ShortcutList } from './ShortcutList.js';

export const HELP_SHORTCUTS_MODAL: ModalDefinition = {
  id: 'help.shortcuts',
  get title() {
    return translateNow('help.shortcuts');
  },
  size: 'md',
  Body: ShortcutList,
};
