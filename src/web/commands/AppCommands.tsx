import { useEffect, useRef } from 'react';
import { useSession, useSignOut } from '../api/hooks.js';
import { useTheme } from '../theme/ThemeContext.js';
import { type AppCommandState, appCommands } from './appCommandList.js';
import { COMMANDS } from './registry.js';

export function AppCommands() {
  const { theme, toggleTheme } = useTheme();
  const signedIn = Boolean(useSession().data);
  const signOut = useSignOut();
  const state: AppCommandState = {
    theme,
    toggleTheme,
    signedIn,
    signingOut: signOut.isPending,
    signOut: () => signOut.mutate(),
  };
  const latest = useRef(state);
  latest.current = state;

  useEffect(
    () => COMMANDS.register('app', () => appCommands(latest.current)),
    [],
  );
  return null;
}
