import type { IconName } from '../components/icons.js';

export interface CommandHost {
  openModal: (id: string) => void;
}

export type CommandMenu =
  | 'toggle'
  | 'create'
  | 'hook'
  | 'present'
  | 'lock'
  | 'reset';
export type CommandScope = 'viewer';

export interface Command {
  id: string;
  title: string;
  group: string;
  keywords?: string;
  icon?: IconName;
  keys?: readonly string[];
  scope?: CommandScope;
  disabled?: string;
  menu?: CommandMenu;
  pane?: string;
  run: (host: CommandHost) => void | Promise<void>;
}

export type CommandProvider = () => readonly Command[];
