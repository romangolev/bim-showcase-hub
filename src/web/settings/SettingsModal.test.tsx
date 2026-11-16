import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { ThemeProvider } from '../theme/ThemeContext.js';
import {
  SETTINGS_STORAGE_KEY,
  SettingsBody,
  SettingsProvider,
} from './index.js';

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('SettingsBody', () => {
  it('renders the switches and persists a toggle', () => {
    render(
      <SettingsProvider>
        <ThemeProvider>
          <SettingsBody />
        </ThemeProvider>
      </SettingsProvider>,
    );
    expect(
      screen.getAllByRole('switch').map((el) => el.getAttribute('aria-label')),
    ).toEqual(['Dark theme', 'Paint brushes', 'Excel export']);
    const paint = screen.getByRole('switch', { name: 'Paint brushes' });
    expect(
      paint.getAttribute('aria-checked') ??
        String((paint as HTMLInputElement).checked),
    ).toBe('true');
    fireEvent.click(paint);
    expect(paint.getAttribute('aria-checked')).toBe('false');
    expect(
      JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}'),
    ).toMatchObject({ paintBrushes: false });
  });
});
