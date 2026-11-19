import type { IconName } from '../components/icons.js';

export interface CommandHost {
  openModal: (id: string) => void;
}

type CommandMenu = 'toggle' | 'create' | 'hook' | 'present' | 'lock' | 'reset';

export interface Command {
  id: string;
  title: string;
  group: string;
  keywords?: string;
  icon?: IconName;
  keys?: readonly string[];
  disabled?: string;
  menu?: CommandMenu;
  pane?: string;
  run: (host: CommandHost) => void | Promise<void>;
}

export type CommandProvider = () => readonly Command[];
