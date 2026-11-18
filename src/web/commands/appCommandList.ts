import { MODALS } from '../modal/registry.js';
import type { Theme } from '../theme/theme.js';
import { TOOLS } from '../tools/index.js';
import type { Command } from './types.js';
import { viewerCommands } from './viewerCommands.js';

export interface AppCommandState {
  theme: Theme;
  toggleTheme: () => void;
  signedIn: boolean;
  signingOut: boolean;
  signOut: () => void;
}

export function appCommands(state: AppCommandState): Command[] {
  const toolModals = new Set(TOOLS.all().map((tool) => tool.modalId));
  const windows = MODALS.filter((modal) => !toolModals.has(modal.id)).map(
    (modal): Command => ({
      id: `settings.${modal.id}`,
      title: modal.id === 'settings' ? 'Open settings' : modal.title,
      group: 'Settings',
      icon: 'settings',
      run: (host) => host.openModal(modal.id),
    }),
  );
  const signOutReason = !state.signedIn
    ? 'You are not signed in'
    : state.signingOut
      ? 'Signing out'
      : undefined;
  return [
    {
      id: 'theme.toggle',
      title: `Switch to ${state.theme === 'dark' ? 'light' : 'dark'} theme`,
      group: 'Appearance',
      keywords: 'dark light mode',
      keys: ['mod+alt+t'],
      run: () => state.toggleTheme(),
    },
    ...windows,
    ...viewerCommands(null),
    ...TOOLS.commands(null, TOOLS.snapshot()),
    {
      id: 'account.signout',
      title: 'Sign out',
      group: 'Account',
      icon: 'logout',
      ...(signOutReason ? { disabled: signOutReason } : {}),
      run: () => state.signOut(),
    },
  ];
}
