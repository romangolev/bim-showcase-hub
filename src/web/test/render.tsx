import {
  render as baseRender,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { CatalogUIStrings } from '../i18n/CatalogUIStrings.js';
import { SettingsProvider } from '../settings/SettingsContext.js';
import { ThemeProvider } from '../theme/ThemeContext.js';

export * from '@testing-library/react';

function Providers({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <ThemeProvider>
        <CatalogUIStrings>{children}</CatalogUIStrings>
      </ThemeProvider>
    </SettingsProvider>
  );
}

export function render(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult {
  return baseRender(ui, { wrapper: Providers, ...options });
}
