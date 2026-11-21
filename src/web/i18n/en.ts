export const EN = {
  'topbar.settings': 'Settings',
  'topbar.help': 'Help',
  'topbar.signIn': 'Sign in',
  'topbar.location': 'Model location',
  'help.shortcuts': 'Keyboard shortcuts',
  'help.docs': 'Documentation',
  'tree.noMatches':
    'No matches for “{query}” in loaded folders. Expand more folders to search deeper.',
} as const;

export type MessageId = keyof typeof EN;
