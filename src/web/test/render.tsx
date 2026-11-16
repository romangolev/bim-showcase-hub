import {
  render as baseRender,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { ThemeProvider } from '../theme/ThemeContext.js';

export * from '@testing-library/react';

export function render(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult {
  return baseRender(ui, { wrapper: ThemeProvider, ...options });
}
