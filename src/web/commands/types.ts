import type { IconName } from '../components/icons.js';

export interface CommandHost {
  openModal: (id: string) => void;
}

export interface Command {
  id: string;
  title: string;
  group: string;
  keywords?: string;
  icon?: IconName;
  disabled?: string;
  run: (host: CommandHost) => void | Promise<void>;
}

export type CommandProvider = () => readonly Command[];
