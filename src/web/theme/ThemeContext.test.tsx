import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsProvider } from '../settings/SettingsContext.js';
import {
  migrateLegacyTheme,
  SETTINGS_STORAGE_KEY,
} from '../settings/settings.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { ThemeProvider, useTheme } from './ThemeContext.js';
import { THEME_STORAGE_KEY } from './theme.js';

function stubScheme(initial: 'light' | 'dark') {
  let scheme = initial;
  const listeners = new Set<() => void>();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return query.includes('light') && scheme === 'light';
      },
      media: query,
      addEventListener: (_: string, listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) =>
        listeners.delete(listener),
    })),
  );
  return {
    listenerCount: () => listeners.size,
    set(next: 'light' | 'dark') {
      scheme = next;
      for (const listener of listeners) listener();
    },
  };
}

function Probe() {
  const { theme, preference, source, setTheme, toggleTheme } = useTheme();
  return (
    <div>
      <output data-testid="theme">{theme}</output>
      <output data-testid="preference">{preference}</output>
      <output data-testid="source">{source}</output>
      <button type="button" onClick={toggleTheme}>
        toggle
      </button>
      <button type="button" onClick={() => setTheme('dark')}>
        force dark
      </button>
      <button type="button" onClick={() => setTheme('system')}>
        follow system
      </button>
    </div>
  );
}

function renderProbe() {
  return render(
    <SettingsProvider>
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    </SettingsProvider>,
  );
}

function press(name: string) {
  act(() => {
    screen.getByRole('button', { name }).click();
  });
}

function storedSettings() {
  return JSON.parse(
    window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}',
  ) as { theme?: string };
}

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.colorScheme = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ThemeProvider', () => {
  it('defaults to the system scheme and marks the document', () => {
    installMemoryStorage();
    stubScheme('light');
    renderProbe();
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(screen.getByTestId('preference')).toHaveTextContent('system');
    expect(screen.getByTestId('source')).toHaveTextContent('system');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('falls back to dark when matchMedia is unavailable', () => {
    installMemoryStorage();
    vi.stubGlobal('matchMedia', undefined);
    renderProbe();
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('persists an explicit choice in the settings blob and prefers it', () => {
    const storage = installMemoryStorage();
    stubScheme('dark');
    const { unmount } = renderProbe();
    press('toggle');
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(screen.getByTestId('preference')).toHaveTextContent('light');
    expect(screen.getByTestId('source')).toHaveTextContent('user');
    expect(storedSettings().theme).toBe('light');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.dataset.theme).toBe('light');
    unmount();
    renderProbe();
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(screen.getByTestId('source')).toHaveTextContent('user');
  });

  it('reads an existing bsh-theme value after the startup migration', () => {
    const storage = installMemoryStorage();
    storage.setItem(THEME_STORAGE_KEY, 'light');
    stubScheme('dark');
    migrateLegacyTheme();
    renderProbe();
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(storedSettings().theme).toBe('light');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBeNull();
    press('follow system');
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(storedSettings().theme).toBe('system');
  });

  it('ignores a stored value that is not a theme', () => {
    const storage = installMemoryStorage();
    storage.setItem(THEME_STORAGE_KEY, 'sepia');
    stubScheme('dark');
    renderProbe();
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(screen.getByTestId('source')).toHaveTextContent('system');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('sepia');
  });

  it('follows system changes only while the preference is system', () => {
    installMemoryStorage();
    const media = stubScheme('dark');
    renderProbe();
    act(() => media.set('light'));
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    press('force dark');
    expect(media.listenerCount()).toBe(0);
    act(() => media.set('light'));
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    press('follow system');
    expect(media.listenerCount()).toBe(1);
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
  });

  it('keeps working when storage throws', () => {
    const failing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => undefined,
      key: () => null,
      length: 0,
      clear: () => undefined,
    } as unknown as Storage;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: failing,
    });
    stubScheme('dark');
    renderProbe();
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    press('toggle');
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('throws outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(/ThemeProvider/);
    spy.mockRestore();
  });
});
