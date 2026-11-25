import {
  applySummaryPreset,
  BUILT_IN_SUMMARY_PRESETS,
  SUMMARY_PRESETS,
  type SummaryPresetData,
} from '../extensions/summaryPresets.js';
import { MODALS } from '../modal/registry.js';
import {
  listSettingsSections,
  openSettingsSection,
} from '../settings/settingsSections.js';
import { notify } from '../tasks/notifications.js';
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
  const presetCommand = (
    id: string,
    name: string,
    data: SummaryPresetData,
  ): Command => ({
    id,
    title: `Apply summary preset: ${name}`,
    group: 'Summary',
    icon: 'table',
    keywords: 'preset summary properties filter sort',
    run: () => {
      const applied = applySummaryPreset(data);
      notify(
        applied
          ? `Applied the summary preset "${name}"`
          : `Could not apply the summary preset "${name}".`,
        { tone: applied ? 'success' : 'error' },
      );
    },
  });
  const presetCommands: Command[] = [
    ...BUILT_IN_SUMMARY_PRESETS.map((starter) =>
      presetCommand(
        `summary.preset.starter.${starter.id}`,
        starter.name,
        starter.data,
      ),
    ),
    ...SUMMARY_PRESETS.list().map((item) =>
      presetCommand(`summary.preset.${item.id}`, item.name, item.data),
    ),
  ];
  const windows = MODALS.filter((modal) => !toolModals.has(modal.id)).map(
    (modal): Command => ({
      id: `settings.${modal.id}`,
      title: modal.id === 'settings' ? 'Open settings' : modal.title,
      group: 'Settings',
      icon: 'settings',
      ...(modal.id === 'settings'
        ? {
            keywords:
              'preferences appearance theme density text size language units local data',
          }
        : {}),
      run: (host) => host.openModal(modal.id),
    }),
  );
  const sections = listSettingsSections().map(
    (section): Command => ({
      id: `settings.section.${section.id}`,
      title: `${section.label()} settings`,
      group: 'Settings',
      icon: section.icon,
      ...(section.keywords ? { keywords: section.keywords } : {}),
      run: (host) => {
        openSettingsSection(section.id);
        host.openModal('settings');
      },
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
    ...sections,
    ...presetCommands,
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
