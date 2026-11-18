import { useEffect, useRef } from 'react';
import { COMMANDS } from '../commands/registry.js';
import { layoutCommands } from './layoutCommandList.js';
import { useLayout } from './layoutContext.js';

export function LayoutCommands() {
  const layout = useLayout();
  const latest = useRef(layout);
  latest.current = layout;
  useEffect(
    () => COMMANDS.register('layout', () => layoutCommands(latest.current)),
    [],
  );
  return null;
}
