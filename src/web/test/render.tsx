import {
  render as baseRender,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { SettingsProvider } from '../settings/SettingsContext.js';
import { ThemeProvider } from '../theme/ThemeContext.js';

export * from '@testing-library/react';

function Providers({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </SettingsProvider>
  );
}

export function render(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult {
  return baseRender(ui, { wrapper: Providers, ...options });
}
