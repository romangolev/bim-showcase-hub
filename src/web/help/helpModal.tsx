import type { ModalDefinition } from '../modal/types.js';
import { ShortcutList } from './ShortcutList.js';

export const HELP_SHORTCUTS_MODAL: ModalDefinition = {
  id: 'help.shortcuts',
  title: 'Keyboard shortcuts',
  size: 'md',
  Body: ShortcutList,
};
